import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';
import { App, AuthResult, GitHub, pbkdf2 } from "../../../../src/utils";

const appExpiryPeriod = (86400000 * 365 * 10)  // 10 years

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
    const app = new App(request, prisma)
    let err, result, session;
    const authToken = request.headers.get('x-trivialsec')
    if (!!authToken.trim()) {
        ({ err, result, session } = await app.authenticate())
        if (result !== AuthResult.AUTHENTICATED) {
            return Response.json({ err, result })
        }
    }
    try {
        let gdData
        if (params?.code && params?.installation_id) {
            const method = "POST"
            const url = new URL("https://github.com/login/oauth/access_token")

            url.search = new URLSearchParams({
                code: params.code,
                client_id: env.GITHUB_APP_CLIENT_ID,
                client_secret: env.GITHUB_APP_CLIENT_SECRET,
            }).toString()

            const resp = await fetch(url, { method })
            const text = await resp.text()
            gdData = Object.fromEntries(text.split('&').map(item => item.split('=').map(decodeURIComponent)))
            if (gdData?.error) {
                throw new Error(gdData.error)
            }
            if (!gdData?.access_token) {
                throw new Error('OAuth response invalid')
            }
        } else {
            return Response.json({ 'err': 'OAuth authorization code not provided' })
        }

        const created = (new Date()).getTime()
        const expires = appExpiryPeriod + created
        const response = { installationId: params.installation_id, session: {}, member: {} }
        const memberExists = await app.memberExists()
        if (!gdData?.access_token) {
            return Response.json({ 'err': 'OAuth authorization failed' })
        }
        if (!memberExists) {
            const gh = new GitHub(gdData.access_token)
            const ghUserData = await gh.getUser()
            let ghEmail
            if (!ghUserData?.email) {
                for (const ghUserEmails of await gh.getUserEmails()) {
                    if (ghUserEmails?.verified === true && !!ghUserEmails?.email) {
                        ghEmail = ghUserEmails.email
                        break
                    }
                }
            }
            let firstName = ''
            let lastName = ''
            if (!!ghUserData?.name) {
                const words = ghUserData.name.split(' ')
                firstName = words.shift() || ''
                lastName = words.join(' ') || ''
            }
            const memberInfo = await prisma.members.create({
                orgName: ghUserData.company,
                email: ghEmail,
                passwordHash: await pbkdf2(gdData.access_token),
                firstName,
                lastName
            })
            console.log(`/github/install register email=${ghEmail}`, memberInfo)

            const token = crypto.randomUUID()
            const authn_ip = request.headers.get('cf-connecting-ip')
            const authn_ua = request.headers.get('user-agent')
            const expiry = created + (86400000 * 30) // 30 days
            const secret = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint32Array(26))))).map(b => b.toString(16).padStart(2, "0")).join("")
            session = {
                kid: token,
                memberEmail: ghEmail,
                expiry,
                issued: created,
                secret,
                authn_ip,
                authn_ua
            }
            const sessionInfo = await prisma.sessions.create(session)
            console.log(`/github/install session kid=${token}`, sessionInfo)
            response.session.token = token
            response.session.expiry = expiry
            response.member.email = ghEmail
            response.member.orgName = ghUserData.company
            response.member.firstName = firstName
            response.member.lastName = lastName
        }
        const GHAppInfo = await prisma.sessions.create({
            installationId: params.installation_id,
            memberEmail: session.memberEmail,
            accessToken: gdData.access_token,
            created,
            expires
        })
        console.log(`/github/install installationId=${params.installation_id}`, GHAppInfo)

        return Response.json(response)
    } catch (err) {
        console.error(err)

        return Response.json({ ok: false, result: AuthResult.REVOKED })
    }
}
