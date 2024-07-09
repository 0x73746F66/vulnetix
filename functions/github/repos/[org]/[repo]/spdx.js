import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';
import { App, AuthResult, GitHub, hex, isSPDX, OSV } from "@/utils";

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
        return Response.json({ err, result })
    }
    const githubApps = await prisma.github_apps.findMany({
        where: {
            memberEmail: session.memberEmail,
        },
    })
    const files = []
    const putOptions = { httpMetadata: { contentType: 'application/json', contentEncoding: 'utf8' } }
    for (const app of githubApps) {
        if (!app.accessToken) {
            console.log(`github_apps kid=${session.kid} installationId=${app.installationId}`)
            throw new Error('github_apps invalid')
        }
        const gh = new GitHub(app.accessToken)

        const repoName = `${params.org}/${params.repo}`
        const data = await gh.getRepoSpdx(repoName)
        if (typeof data?.sbom === 'undefined' || typeof data?.sbom?.SPDXID === 'undefined' || !isSPDX(data?.sbom)) {
            continue
        }
        const spdx = data.sbom
        const spdxStr = JSON.stringify(spdx)
        const spdxId = await hex(spdxStr)
        const objectPrefix = `github/${app.installationId}/repos/${repoName}/sbom/`
        console.log(`${repoName}/sbom/${spdxId}.json`, await env.r2icache.put(`${objectPrefix}${spdxId}.json`, spdxStr, putOptions))
        const info = await env.d1db.prepare(`
            INSERT OR REPLACE INTO spdx (
            spdxId,
            spdxVersion,
            source,
            repoName,
            name,
            dataLicense,
            documentNamespace,
            toolName,
            packageCount,
            createdAt,
            memberEmail,
            comment
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        `)
            .bind(
                spdxId,
                spdx.spdxVersion,
                'GitHub',
                repoName,
                spdx.name,
                spdx.dataLicense,
                spdx.documentNamespace,
                spdx.creationInfo.creators.join(', '),
                spdx.packages.length,
                (new Date(spdx.creationInfo.created)).getTime(),
                session.memberEmail,
                spdx.creationInfo?.comment
            )
            .run()

        console.log(`/github/repos/spdx ${repoName} kid=${session.kid}`, info)
        files.push(data)

        const osvQueries = spdx.packages.flatMap(pkg => {
            if (!pkg?.externalRefs) { return }
            return pkg.externalRefs
                .filter(ref => ref?.referenceType === 'purl')
                .map(ref => ({
                    purl: ref.referenceLocator,
                    name: pkg.name,
                    version: pkg.versionInfo,
                    licenseDeclared: pkg.licenseDeclared
                }))
        })
        const osv = new OSV()
        const queries = osvQueries.filter(q => q?.purl).map(q => ({ package: { purl: q.purl } }))
        const vulns = await osv.queryBatch(queries)
        if (typeof vulns?.length !== 'undefined') {
            let i = 0
            for (const vuln of vulns) {
                if (typeof vuln?.id === 'undefined') {
                    continue
                }
                const findingId = await hex(`${session.memberEmail}${vuln.id}${osvQueries[i].name}${osvQueries[i].version}`)
                const finding = await prisma.findings.upsert({
                    where: {
                        findingId,
                    },
                    update: {
                        modifiedAt: (new Date(vuln.modified)).getTime()
                    },
                    create: {
                        findingId,
                        memberEmail: session.memberEmail,
                        source: 'osv.dev',
                        category: 'sca',
                        createdAt: (new Date()).getTime(),
                        modifiedAt: (new Date(vuln.modified)).getTime(),
                        detectionTitle: vuln.id,
                        purl: osvQueries[i].purl,
                        packageName: osvQueries[i].name,
                        packageVersion: osvQueries[i].version,
                        licenseDeclared: osvQueries[i].licenseDeclared,
                        spdxId
                    }
                })
                console.log(`findings SCA`, finding)
                i = i++
            }
        }

    }

    return Response.json(files)
}
