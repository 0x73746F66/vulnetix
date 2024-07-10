import { App, AuthResult, GitHub } from "@/utils";
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
    const { err, result, session } = await (new App(request, prisma)).authenticate()
    if (result !== AuthResult.AUTHENTICATED) {
        return Response.json({ error: { message: err }, result })
    }

    const githubApps = []
    const gitRepos = []
    const putOptions = { httpMetadata: { contentType: 'application/json', contentEncoding: 'utf8' } }
    const installs = await prisma.github_apps.findMany({
        where: {
            memberEmail: session.memberEmail,
        },
    })
    for (const app of installs) {
        if (!app.accessToken) {
            console.log(`github_apps kid=${session.kid} installationId=${app.installationId}`)
            throw new Error('github_apps invalid')
        }
        const gh = new GitHub(app.accessToken)
        const prefixRepos = `github/${app.installationId}/repos/`

        console.log(`prefixRepos = ${prefixRepos}`)
        const { content, error } = await gh.getRepos()
        if (error?.message) {
            delete app.accessToken
            delete app.memberEmail
            return Response.json({ error, app })
        }
        for (const repo of content) {
            const pathSuffix = `${repo.full_name}.json`
            console.log(`r2icache.put ${prefixRepos}${pathSuffix}`)
            await env.r2icache.put(`${prefixRepos}${pathSuffix}`, JSON.stringify(repo), putOptions)

            const data = await store(prisma, session, repo)
            gitRepos.push(data)
        }
        githubApps.push({
            installationId: app.installationId,
            login: app.login,
            created: app.created,
            expires: app.expires,
        })
    }

    const memberKeys = await prisma.member_keys.findMany({
        where: {
            memberEmail: session.memberEmail,
            keyType: 'github_pat',
        },
    })
    for (const memberKey of memberKeys) {
        const gh = new GitHub(memberKey.secret)
        const { content, error } = await gh.getRepos()
        if (error?.message) {
            return Response.json({ error, app: { login: memberKey.keyLabel } })
        }
        for (const repo of content) {
            const data = await store(prisma, session, repo)
            gitRepos.push(data)
        }
    }

    return Response.json({ githubApps, gitRepos })
}
const store = async (prisma, session, repo) => {
    const data = {
        ghid: repo.id.toString(),
        fullName: repo.full_name,
        ownerId: repo.owner.id,
        createdAt: (new Date(repo.created_at)).getTime(),
        updatedAt: (new Date(repo.updated_at)).getTime(),
        visibility: repo.visibility,
        archived: repo.archived ? 1 : 0,
        fork: repo.fork ? 1 : 0,
        template: repo.is_template ? 1 : 0,
        defaultBranch: repo.default_branch,
        pushedAt: (new Date(repo.pushed_at)).getTime(),
        avatarUrl: repo.owner.avatar_url,
        licenseSpdxId: repo.license?.spdx_id || '',
        licenseName: repo.license?.name || '',
    }
    const info = await prisma.git_repos.upsert({
        where: {
            pk: data.ghid,
        },
        update: {
            fullName: data.fullName,
            updatedAt: data.updatedAt,
            pushedAt: data.pushedAt,
            defaultBranch: data.defaultBranch,
            ownerId: data.ownerId,
            licenseSpdxId: data.licenseSpdxId,
            licenseName: data.licenseName,
            fork: data.fork,
            template: data.template,
            archived: data.archived,
            visibility: data.visibility,
            avatarUrl: data.avatarUrl,
        },
        create: {
            pk: data.ghid,
            fullName: data.fullName,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            pushedAt: data.pushedAt,
            defaultBranch: data.defaultBranch,
            ownerId: data.ownerId,
            memberEmail: session.memberEmail,
            licenseSpdxId: data.licenseSpdxId,
            licenseName: data.licenseName,
            fork: data.fork,
            template: data.template,
            archived: data.archived,
            visibility: data.visibility,
            avatarUrl: data.avatarUrl,
        }
    })

    console.log(`/github/repos git_repos ${data.fullName} kid=${session.kid}`, info)
    return data
}
