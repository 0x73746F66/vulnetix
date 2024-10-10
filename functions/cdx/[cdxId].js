import { Server } from "@/utils";
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

export async function onRequestDelete(context) {
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
    const verificationResult = await (new Server(request, prisma)).authenticate()
    if (!verificationResult.isValid) {
        return Response.json({ ok: false, result: verificationResult.message })
    }
    const cdx = await prisma.CycloneDXInfo.findFirst({
        where: { cdxId: params.cdxId },
        include: {
            artifact: {
                include: {
                    downloadLinks: true
                }
            },
        }
    })
    for (const link of cdx.artifact.downloadLinks) {
        await prisma.Link.delete({ where: { id: link.id } })
    }
    await prisma.Artifact.delete({ where: { uuid: cdx.artifact.uuid } })

    const cdxInfo = await prisma.CycloneDXInfo.delete({ where: { cdxId: params.cdxId } })
    console.log(`DELETE /cdx/[${params.cdxId}]`, cdxInfo)
    return Response.json({ ok: true, cdxId: params.cdxId, artifactUuid: cdx.artifact.uuid })
}
