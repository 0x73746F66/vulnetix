import { App, AuthResult, OSV, hex, isSPDX } from "@/utils";
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';


export async function onRequestPost(context) {
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

    const files = []
    let errors = new Set()
    try {
        const putOptions = { httpMetadata: { contentType: 'application/json', contentEncoding: 'utf8' } }
        const inputs = await request.json()
        for (const spdx of inputs) {
            if (!isSPDX(spdx)) {
                return Response.json({
                    ok: false, error: {
                        message: 'SPDX is missing necessary fields.'
                    }
                })
            }
            const spdxStr = JSON.stringify(spdx)
            const spdxId = await hex(spdxStr)
            const objectPrefix = `uploads/${session.memberEmail}/spdx/`
            const fileName = `${spdxId}.json`
            const r2Put = await env.r2icache.put(`${objectPrefix}${fileName}`, spdxStr, putOptions)
            console.log(fileName, JSON.stringify(r2Put))
            const info = await prisma.spdx.upsert({
                where: {
                    spdxId,
                    memberEmail: session.memberEmail,
                },
                update: {
                    createdAt: (new Date(spdx.creationInfo.created)).getTime(),
                },
                create: {
                    spdxId,
                    spdxVersion: spdx.spdxVersion,
                    source: 'upload',
                    repoName: '',
                    name: spdx.name,
                    dataLicense: spdx.dataLicense,
                    documentNamespace: spdx.documentNamespace,
                    toolName: spdx.creationInfo.creators.join(', '),
                    packageCount: spdx.packages.length,
                    createdAt: (new Date(spdx.creationInfo.created)).getTime(),
                    memberEmail: session.memberEmail,
                    comment: spdx.creationInfo?.comment || ''
                }
            })

            console.log(`/github/repos/spdx ${fileName} kid=${session.kid}`, info)

            files.push({
                spdxId,
                spdxVersion: spdx.spdxVersion,
                source: 'upload',
                repoName: '',
                name: spdx.name,
                dataLicense: spdx.dataLicense,
                documentNamespace: spdx.documentNamespace,
                toolName: spdx.creationInfo.creators.join(', '),
                packageCount: spdx.packages.length,
                createdAt: (new Date(spdx.creationInfo.created)).getTime(),
                memberEmail: session.memberEmail,
                comment: spdx.creationInfo?.comment || ''
            })

            const osvQueries = spdx.packages.flatMap(pkg => {
                if (!pkg?.externalRefs) { return }
                return pkg.externalRefs
                    .filter(ref => ref?.referenceType === 'purl')
                    .map(ref => ({
                        purl: ref.referenceLocator,
                        name: pkg.name,
                        version: pkg?.versionInfo,
                        licenseDeclared: pkg?.licenseDeclared
                    }))
            })
            const osv = new OSV()
            const queries = osvQueries.filter(q => q?.purl).map(q => ({ package: { purl: q?.purl } }))
            console.log(`osvQueries`, queries)
            const vulns = await osv.queryBatch(queries)
            console.log(`vulns length`, vulns?.length)
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
                    const vex = await prisma.triage_activity.upsert({
                        where: {
                            findingId,
                        },
                        update: {
                            lastObserved: (new Date()).getTime()
                        },
                        create: {
                            findingId,
                            createdAt: (new Date()).getTime(),
                            lastObserved: (new Date()).getTime(),
                            seen: 0,
                            analysisState: 'in_triage'
                        }
                    })
                    console.log(`findings VEX`, vex)
                    i = i++
                }
            }
        }
    } catch (err) {
        console.error(err)

        return Response.json({ ok: false, error: { message: err }, result: AuthResult.REVOKED, files })
    }
    if (errors.size) {
        errors = [...errors].join(' ')
    } else {
        errors = null
    }

    return Response.json({ ok: true, files, error: { message: errors } })
}
