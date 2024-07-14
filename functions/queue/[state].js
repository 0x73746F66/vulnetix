import { App, AuthResult } from "@/utils";
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
        const { searchParams } = new URL(request.url)
        const take = parseInt(searchParams.get('take'), 10) || 50
        const skip = parseInt(searchParams.get('skip'), 10) || 0
        const sca = await prisma.findings.findMany({
            where: {
                memberEmail: session.memberEmail,
                category: 'sca',
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
                triage: {
                    where: {
                        analysisState: params.state
                    }
                },
                // cdx: true
            },
            take,
            skip,
            orderBy: {
                createdAt: 'asc',
            }
        })
        const sast = await prisma.sarif_results.findMany({
            where: {
                sarif: {
                    memberEmail: session.memberEmail,
                },
            },
            include: {
                sarif: true
            },
            take,
            skip,
            orderBy: {
                guid: 'asc',
            },
        })

        return Response.json({ ok: true, sca, sast })
    } catch (err) {
        console.error(err)
        return Response.json({ ok: false, error: { message: err }, result: AuthResult.REVOKED })
    }
}
