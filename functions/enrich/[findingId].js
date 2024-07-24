import { App, AuthResult, OSV } from "@/utils";
import { CVSS30, CVSS31, CVSS40 } from '@pandatix/js-cvss';
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
    try {
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
            return Response.json({ ok: false, error: { message: err }, result })
        }
        const { findingId } = params
        let finding = await prisma.findings.findUnique({
            where: {
                findingId,
            },
            omit: {
                memberEmail: true,
            },
            include: {
                spdx: {
                    include: {
                        repo: true
                    }
                },
                triage: true,
                // cdx: true
            }
        })
        if (finding?.spdx && finding.spdx?.packagesJSON && finding.spdx?.relationshipsJSON) {
            finding = {
                ...finding,
                spdx: {
                    ...finding.spdx,
                    packagesJSON: JSON.parse(finding.spdx.packagesJSON),
                    relationshipsJSON: JSON.parse(finding.spdx.relationshipsJSON)
                }
            }
        }

        finding.fullName = result.cdx?.repo?.fullName || result.spdx?.repo?.fullName || 'Others'
        const osv = new OSV()
        const vuln = await osv.query(prisma, session.memberEmail, finding.detectionTitle)
        finding.modifiedAt = (new Date(vuln.modified)).getTime()
        finding.publishedAt = (new Date(vuln.published)).getTime()
        finding.databaseReviewed = !!vuln?.database_specific?.github_reviewed
        finding.cve = vuln.aliases.filter(a => a.startsWith('CVE-')).pop()
        finding.aliases = vuln.aliases
        finding.cwes = vuln?.database_specific?.cwe_ids || []
        finding.packageEcosystem = vuln.affected.filter(affected => affected.package.ecosystem).pop()
        finding.sourceCodeUrl = vuln.affected.filter(affected => affected.database_specific.source).pop()
        finding.fixVersion = vuln.affected.filter(affected => affected.ranges.pop()?.events.pop()?.fixed).pop()
        finding.vulnerableVersionRange = vuln.affected.filter(affected => affected.database_specific.last_known_affected_version_range).pop()
        finding.fixAutomatable = !!finding.vulnerableVersionRange && !!finding.fixVersion
        finding.referencesJSON = JSON.stringify(vuln.references.map(reference => reference.url))
        const info = await prisma.findings.update({
            where: {
                findingId,
            },
            data: finding
        })
        console.log(`Update ${finding.detectionTitle}`, info)

        // const cvss4 = finding.severity.filter(i => i.score.startsWith('CVSS:4')).pop()
        // const cvss31 = finding.severity.filter(i => i.score.startsWith('CVSS:3.1')).pop()
        // const cvss3 = finding.severity.filter(i => i.score.startsWith('CVSS:3')).pop()
        // const vec = !!cvss4 ? CVSS40(cvss4) : !!cvss31 ? CVSS31(cvss31) : cvss3 ? CVSS30(cvss3) : null
        // if (
        //     ['E:U', 'E:P', 'E:F', 'E:H'].some(substring => cvss3.includes(substring)) ||
        //     ['E:A', 'E:P', 'E:U'].some(substring => cvss4.includes(substring))
        // ) {
        //     const triage_activity = {
        //         findingId,
        //         createdAt: new Date().getTime(),
        //         lastObserved,
        //         cvssVector,
        //         cvssScore: vec.Score(),
        //         epssPercentile,
        //         epssScore,
        //         ssvc,
        //         remediation,
        //         analysisState,
        //         analysisJustification,
        //         analysisResponse,
        //         analysisDetail,
        //     }

        // }

        return Response.json({ ok: true, finding })
    } catch (err) {
        console.error(err)
        return Response.json({ ok: false, error: { message: err }, result: AuthResult.REVOKED })
    }
}
