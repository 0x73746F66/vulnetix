import { App, appExpiryPeriod, AuthResult, GitHub, pbkdf2 } from "@/utils";
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

export async function onRequestGet(context) {
    const {
        request, // same as existing Worker API
        env, // same as existing Worker API
        params, // if filename includes [id] or [[path]]
        waitUntil, // same as ctx.waitUntil in existing Worker API
        next, // used for middleware or to fetch assets
        data, // arbitrary space for passing data between middlewares
    } = context
    const adapter = new PrismaD1(env.d1db)
    const prisma = new PrismaClient({
        adapter,
        transactionOptions: {
            maxWait: 1500, // default: 2000
            timeout: 2000, // default: 5000
        },
    })
    try {
        const app = new App(request, prisma)
        let oauthData
        if (params?.code) {
            const method = "POST"
            const url = new URL("https://github.com/login/oauth/access_token")

            url.search = new URLSearchParams({
                code: params.code,
                client_id: env.GITHUB_APP_CLIENT_ID,
                client_secret: env.GITHUB_APP_CLIENT_SECRET,
            }).toString()

            const headers = { 'Accept': 'application/json' }
            const resp = await fetch(url, { headers, method })
            oauthData = await resp.json()
            if (oauthData?.error) {
                return Response.json({ ok: false, error: { message: oauthData.error } })
            }
        } else {
            return Response.json({ ok: false, error: { message: 'OAuth authorization code not provided' } })
        }

        if (!oauthData?.access_token) {
            return Response.json({ ok: false, error: { message: 'OAuth authorization failed' } })
        }
        const gh = new GitHub(oauthData.access_token)
        const created = (new Date()).getTime()
        const response = { ok: false, session: {}, member: {} }
        const { content, error, tokenExpiry } = await gh.getUser()
        if (error?.message) {
            return Response.json({ ok: false, error })
        }
        const expires = tokenExpiry || appExpiryPeriod + created
        let ghEmail
        const ghUserEmails = await gh.getUserEmails()
        if (!ghUserEmails?.ok || ghUserEmails?.error?.message || !ghUserEmails?.content || !ghUserEmails.content?.length) {
            return Response.json({ ok: ghUserEmails.ok, error: ghUserEmails.error, result: `${ghUserEmails.status} ${ghUserEmails.statusText}` })
        }
        for (const ghUserEmail of ghUserEmails.content) {
            if (ghUserEmail?.verified === true && !!ghUserEmail?.email && !ghUserEmail.email.endsWith('@users.noreply.github.com')) {
                ghEmail = ghUserEmail.email
                break
            }
        }
        if (content?.email && !ghEmail) {
            ghEmail = content.email
        }
        const memberCheck = await app.memberExists(ghEmail)
        if (memberCheck.exists) {
            response.member = memberCheck.member
        } else {
            let firstName = ''
            let lastName = ''
            if (!!content?.name) {
                const words = content.name.split(' ')
                firstName = words.shift() || ''
                lastName = words.join(' ') || ''
            }
            response.member = {
                email: ghEmail,
                avatarUrl: content?.avatar_url || '',
                orgName: content?.company || '',
                passwordHash: await pbkdf2(oauthData.access_token),
                firstName,
                lastName
            }
            const memberInfo = await prisma.members.create({
                data: response.member
            })
            console.log(`/github/install register email=${ghEmail}`, memberInfo)
            delete response.member.passwordHash
        }
        const token = crypto.randomUUID()
        const authn_ip = request.headers.get('cf-connecting-ip')
        const authn_ua = request.headers.get('user-agent')
        const expiry = created + (86400000 * 30) // 30 days
        const secret = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint32Array(26))))).map(b => b.toString(16).padStart(2, "0")).join("")
        const sessionInfo = await prisma.sessions.create({
            data: {
                kid: token,
                memberEmail: response.member.email,
                expiry,
                issued: created,
                secret,
                authn_ip,
                authn_ua
            }
        })
        console.log(`/github/install session kid=${token}`, sessionInfo)
        response.session.token = token
        response.session.expiry = expiry
        const githubApp = await prisma.github_apps.findFirst({
            where: { memberEmail: response.member.email },
        })
        let installationId = githubApp?.installationId
        if (!installationId) {
            const ghInstalls = await gh.getInstallations()
            if (!ghInstalls?.ok || ghInstalls?.error?.message || !ghInstalls?.content?.installations || !ghInstalls.content?.installations?.length) {
                return Response.json({ ok: ghInstalls.ok, error: ghInstalls.error, result: `${ghInstalls.status} ${ghInstalls.statusText}` })
            }
            for (const install of ghInstalls.content.installations) {
                if (install.app_slug === "triage-by-trivial-security") {
                    installationId = install.id
                    break
                }
            }
        }
        if (installationId) {
            const GHAppInfo = await prisma.github_apps.upsert({
                where: {
                    installationId,
                },
                update: {
                    accessToken: oauthData.access_token,
                    login: content.login,
                    expires,
                },
                create: {
                    installationId: installationId,
                    memberEmail: response.member.email,
                    accessToken: oauthData.access_token,
                    login: content.login,
                    created,
                    expires
                }
            })
            console.log(`/github/install installationId=${params.installation_id}`, GHAppInfo)
            response.result = AuthResult.AUTHENTICATED
            response.ok = true
        } else {
            response.result = `NOT_INSTALLED`
            response.error.message = `Please install the GitHub App before logging in.`
        }

        return Response.json(response)
    } catch (err) {
        console.error(err)

        return Response.json({ ok: false, error: { message: err }, result: AuthResult.REVOKED })
    }
}
