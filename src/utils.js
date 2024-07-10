/**
 * Class representing the possible results of an authentication attempt.
 */
export class AuthResult {
    static get FORBIDDEN() { return "Forbidden"; }
    static get REVOKED() { return "Revoked"; }
    static get EXPIRED() { return "Expired"; }
    static get AUTHENTICATED() { return "Authenticated"; }
}

/**
 * Class representing an application with authentication logic.
 */
export class App {
    /**
     * Create an App instance.
     * @param {Object} request - The request object, typically containing headers.
     * @param {Object} prisma - The Prisma client instance for database interaction.
     */
    constructor(request, prisma) {
        this.request = request;
        this.prisma = prisma;
    }

    /**
     * Checks if an email has been registered or not.
     * @return {Promise<Object>} The authentication result.
     */
    async memberExists(memberEmail) {
        try {
            const member = await this.prisma.members.findFirstOrThrow({
                where: { email: memberEmail },
            });

            return memberEmail === member.email;
        } catch (err) {
            if (err.name === 'NotFoundError') {
                return false;
            }
            throw err;
        }
    }

    /**
     * Authenticate the request based on a token in the headers.
     * @return {Promise<Object>} The authentication result.
     */
    async authenticate() {
        try {
            const token = this.request.headers.get('x-trivialsec');

            if (!token) {
                return { err: null, result: AuthResult.FORBIDDEN, session: null };
            }

            const session = await this.prisma.sessions.findFirstOrThrow({
                where: { kid: token },
            });

            if (!session.expiry || session.expiry <= Date.now()) {
                return { err: null, result: AuthResult.EXPIRED, session: null };
            }

            return { err: null, result: AuthResult.AUTHENTICATED, session };
        } catch (err) {
            if (err.name === 'NotFoundError') {
                return { err: null, result: AuthResult.REVOKED, session: null };
            }
            return { err, result: null, session: null };
        }
    }
}

export class OSV {
    constructor() {
        this.headers = {
            'Accept': 'application/json',
            'User-Agent': 'Triage-by-Trivial-Security',
        }
        this.baseUrl = "https://api.osv.dev/v1"
    }
    async fetchJSON(url, body) {
        try {
            const response = await fetch(url, { headers: this.headers, method: 'POST', body: JSON.stringify(body) })
            const respText = await response.text()
            if (!response.ok) {
                console.error(`resp headers=${JSON.stringify(this.headers, null, 2)}`)
                console.error(respText)
                console.error(`OSV error! status: ${response.status} ${response.statusText}`)
            }
            const content = JSON.parse(respText)
            return { ok: response.ok, status: response.status, statusText: response.statusText, content, url }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { url, error: { message: e.message, lineno, colno } }
        }
    }
    async queryBatch(queries) {
        // https://google.github.io/osv.dev/post-v1-querybatch/
        const url = `${this.baseUrl}/querybatch`
        const resp = await this.fetchJSON(url, { queries })
        if (resp?.content?.results) {
            return resp.content.results.map(r => r?.vulns || [{}]).flat(1)
        }
        return []
    }
}

export class VulnCheck {
    // if (!vulncheck) {
    //     continue
    // }
    // const vc = await vulncheck.getPurl(ref.referenceLocator)
    // if (vc?.content && vc.content?.errors) {
    //     vc.content.errors.map(e => errors.add(`VulnCheck error [${vc.url}] ${e}`))
    // }
    // if (vc?.status === 402) {
    //     break vulncheckPackages
    // }
    // if (vc?.ok === true) {
    //     const createLog = await prisma.integration_usage_log.create({
    //         data: {
    //             memberEmail: session.memberEmail,
    //             source: 'vulncheck',
    //             request: JSON.stringify({ url: vc.url, purl: ref.referenceLocator }),
    //             response: JSON.stringify(vc.content),
    //             statusCode: vc?.status ? parseInt(vc.status, 10) : 0,
    //             createdAt: (new Date()).getTime(),
    //         }
    //     })
    //     console.log(`vulncheck.getPurl(${ref.referenceLocator})`, createLog)
    //     for (const vulnerability of vc.content?.data?.vulnerabilities) {
    //         const createFinding = await prisma.findings.create({
    //             data: {
    //                 findingId: hex(`${session.memberEmail}${vulnerability.detection}${pkg.name}${pkg.versionInfo}`),
    //                 memberEmail: session.memberEmail,
    //                 source: 'vulncheck',
    //                 category: 'sca',
    //                 createdAt: (new Date()).getTime(),
    //                 detectionTitle: vulnerability.detection,
    //                 purl: ref.referenceLocator,
    //                 packageName: pkg.name,
    //                 packageVersion: pkg.versionInfo,
    //                 licenseDeclared: pkg.licenseDeclared,
    //                 fixedVersion: vulnerability?.fixed_version,
    //                 maliciousSource: research_attributes.malicious_source,
    //                 abandoned: research_attributes.abandoned,
    //                 squattedPackage: research_attributes.squatted_package,
    //             }
    //         })
    //         console.log(`findings SCA`, createFinding)
    //     }
    // }
    // const keyData = await prisma.member_keys.findFirst({
    //     where: {
    //         memberEmail: session.memberEmail,
    //         keyType: 'vulncheck',
    //     }
    // })
    // let vulncheck
    // if (typeof keyData?.secret !== 'undefined') {
    //     vulncheck = new VulnCheck(keyData.secret)
    // }
    constructor(BearerToken) {
        this.headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${BearerToken}`,
            'User-Agent': 'Triage-by-Trivial-Security',
        }
        this.baseUrl = "https://api.vulncheck.com/v3"
    }
    async fetchJSON(url) {
        try {
            const response = await fetch(url, { headers: this.headers })
            const respText = await response.text()
            if (!response.ok) {
                console.error(`resp headers=${JSON.stringify(this.headers, null, 2)}`)
                console.error(respText)
                console.error(`VulnCheck error! status: ${response.status} ${response.statusText}`)
            }
            const content = JSON.parse(respText)
            return { ok: response.ok, status: response.status, statusText: response.statusText, content, url }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { url, error: { message: e.message, lineno, colno } }
        }
    }
    async getPurl(purl) {
        // https://docs.vulncheck.com/api/purl
        const url = `${this.baseUrl}/purl?purl=${purl}`
        console.log(`VulnCheck.getPurl(${purl})`)
        return this.fetchJSON(url)
    }
    async getCPE(cpe) {
        // https://docs.vulncheck.com/api/cpe
        const url = `${this.baseUrl}/cpe?cpe=${cpe}`
        console.log(`VulnCheck.getCPE(${cpe})`)
        return await this.fetchJSON(url)
    }
}

export class GitHub {
    constructor(accessToken) {
        this.headers = {
            'Accept': 'application/vnd.github+json',
            'Authorization': `token ${accessToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Triage-by-Trivial-Security',
        }
        this.baseUrl = "https://api.github.com"
    }
    async fetchJSON(url) {
        try {
            const response = await fetch(url, { headers: this.headers })
            const respText = await response.text()
            if (!response.ok) {
                console.error(`resp headers=${JSON.stringify(this.headers, null, 2)}`)
                console.error(respText)
                console.error(`GitHub error! status: ${response.status} ${response.statusText}`)
            }
            const content = JSON.parse(respText)
            return { ok: response.ok, status: response.status, statusText: response.statusText, error: { message: content?.message }, content, url }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { url, error: { message: e.message, lineno, colno } }
        }
    }
    async fetchSARIF(url) {
        try {
            const headers = Object.assign(this.headers, { 'Accept': 'application/sarif+json' })
            const response = await fetch(url, { headers })
            const respText = await response.text()
            if (!response.ok) {
                console.error(`resp headers=${JSON.stringify(response.headers, null, 2)}`)
                console.error(respText)
                console.error(`GitHub error! status: ${response.status} ${response.statusText}`)
            }
            const content = JSON.parse(respText)
            return { ok: response.ok, status: response.status, statusText: response.statusText, error: { message: content?.message }, content, url }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { url, error: { message: e.message, lineno, colno } }
        }
    }
    async getRepoSarif(full_name) {
        // https://docs.github.com/en/rest/code-scanning/code-scanning?apiVersion=2022-11-28#list-code-scanning-analyses-for-a-repository
        const files = []
        const perPage = 100
        let page = 1

        while (true) {
            const url = `${this.baseUrl}/repos/${full_name}/code-scanning/analyses?per_page=${perPage}&page=${page}`
            console.log(`github.getRepoSarif(${full_name}) ${url}`)
            const data = await this.fetchJSON(url)
            if (!data?.ok) {
                return data
            }
            for (const report of data.content) {
                const sarifUrl = `${this.baseUrl}/repos/${full_name}/code-scanning/analyses/${report.id}`
                console.log(`github.getRepoSarif(${full_name}) ${sarifUrl}`)
                const sarifData = await this.fetchSARIF(sarifUrl)
                if (!sarifData?.ok) {
                    return sarifData
                }
                if (report?.id && isSARIF(sarifData.content)) {
                    files.push({
                        full_name,
                        report: Object.assign({}, report),
                        sarif: Object.assign({}, sarifData.content)
                    })
                } else {
                    console.log(`github.getRepoSarif(${full_name})`, report?.id, isSARIF(sarifData.content), sarifData)
                }
            }

            if (data.content.length < perPage) {
                break
            }

            page++
        }

        return { content: files }
    }
    async getRepoSpdx(full_name) {
        // https://docs.github.com/en/rest/dependency-graph/sboms?apiVersion=2022-11-28#export-a-software-bill-of-materials-sbom-for-a-repository
        const url = `${this.baseUrl}/repos/${full_name}/dependency-graph/sbom`
        console.log(`github.getRepoSpdx(${full_name}) ${url}`)
        return this.fetchJSON(url)
    }
    async getUserEmails() {
        // https://docs.github.com/en/rest/users/emails?apiVersion=2022-11-28#list-email-addresses-for-the-authenticated-user
        const url = `${this.baseUrl}/user/emails`
        console.log(`github.getUserEmails() ${url}`)
        return this.fetchJSON(url)
    }
    async getUser() {
        // https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28#get-the-authenticated-user
        const url = `${this.baseUrl}/user`
        console.log(`github.getUser() ${url}`)
        return this.fetchJSON(url)
    }
    async revokeToken() {
        const url = `${this.baseUrl}/installation/token`
        try {
            const method = "DELETE"
            const response = await fetch(url, { headers: this.headers, method })
            if (!response.ok) {
                console.error(`resp headers=${JSON.stringify(this.headers, null, 2)}`)
                console.error(`GitHub error! status: ${response.status} ${response.statusText}`)
            }
            return { ok: response.ok, status: response.status, statusText: response.statusText, url }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { url, error: { message: e.message, lineno, colno } }
        }
    }
    async getRepos() {
        // https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repositories-for-the-authenticated-user
        const repos = []
        const perPage = 100
        let page = 1

        while (true) {
            const url = `${this.baseUrl}/user/repos?per_page=${perPage}&page=${page}`
            console.log(`github.getRepos() ${url}`)
            const data = await this.fetchJSON(url)
            if (!data?.ok) {
                return data
            }
            repos.push(...data.content)

            if (data.content.length < perPage) {
                break
            }

            page++
        }

        return { content: repos }
    }
    async getBranch(repo, branch) {
        // https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
        const url = `${this.baseUrl}/repos/${repo.full_name}/branches/${branch}`
        console.log(`github.getBranch() ${url}`)
        return this.fetchJSON(url)
    }
    async getBranches(full_name) {
        // https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#list-branches
        const branches = []
        const perPage = 100
        let page = 1

        while (true) {
            const currentBranches = await this.fetchJSON(`${this.baseUrl}/repos/${full_name}/branches?per_page=${perPage}&page=${page}`)

            branches.push(...currentBranches)

            if (currentBranches.length < perPage) {
                break
            }

            page++
        }

        return { content: branches }
    }
    async getCommit(full_name, commit_sha) {
        // https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28
        const url = `${this.baseUrl}/repos/${full_name}/commits/${commit_sha}`
        console.log(`github.getCommit() ${url}`)
        return this.fetchJSON(url)
    }
    async getCommits(full_name, branch_name) {
        // https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28
        const commits = []
        const perPage = 100
        let page = 1

        while (true) {
            const currentCommits = await this.fetchJSON(`${this.baseUrl}/repos/${full_name}/commits?sha=${branch_name}&per_page=${perPage}&page=${page}`)

            commits.push(...currentCommits.content)

            if (currentCommits.length < perPage) {
                break
            }

            page++
        }

        return { content: commits }
    }
    async getFileContents(full_name, branch_name) {
        // https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28
        const fileUrl = `${this.baseUrl}/repos/${full_name}/contents/.trivialsec?ref=${branch_name}`

        console.log(fileUrl)
        try {
            const fileResponse = await fetch(fileUrl, { headers: this.headers })
            if (!fileResponse.ok) {
                if (fileResponse.status === 404) {
                    return { exists: false, content: null }
                }
                console.error(await response.text(), response.headers.entries().map(pair => `${pair[0]}: ${pair[1]}`))
                throw new Error(`getFileContents error! status: ${response.status} ${response.statusText}`)
            }
            const file = await fileResponse.json()
            const content = Buffer.from(file.content, file.encoding).toString('utf-8')

            return { exists: true, content }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`, e.stack)

            return { exists: false, ok: response.ok, status: response.status, statusText: response.statusText, error: { message: e.message, lineno, colno } }
        }
    }
}
/**
 * ensureStrReqBody reads in the incoming request body
 * Use await ensureStrReqBody(..) in an async function to get the string
 * @param {Request} request the incoming request to read from
 */
export async function ensureStrReqBody(request) {
    const contentType = request.headers.get("content-type")
    if (contentType.includes("application/json")) {
        return JSON.stringify(await request.json())
    } else if (contentType.includes("application/text")) {
        return request.text()
    } else if (contentType.includes("text/html")) {
        return request.text()
    } else if (contentType.includes("form")) {
        const formData = await request.formData()
        const body = {}
        for (const entry of formData.entries()) {
            body[entry[0]] = entry[1]
        }

        return JSON.stringify(body)
    } else {
        // Perhaps some other type of data was submitted in the form
        // like an image, or some other binary data.
        throw new Error("Unhandled type")
    }
}

export async function pbkdf2Verify(key, password, hashBits = 512) {
    let compositeStr = null                     // composite key is salt, iteration count, and derived key
    try { compositeStr = atob(key) } catch (e) { throw new Error('Invalid key') }                       // decode from base64
    const version = compositeStr.slice(0, 3)    //  3 bytes
    const saltStr = compositeStr.slice(3, 19)   // 16 bytes (128 bits)
    const iterStr = compositeStr.slice(19, 22)  //  3 bytes
    const keyStr = compositeStr.slice(22)       // remaining bytes
    if (version != 'v01') {
        throw new Error('Invalid key')
    }

    // -- recover salt & iterations from stored (composite) key
    const saltUint8 = new Uint8Array(saltStr.match(/./g).map(ch => ch.charCodeAt(0)))                   // salt as Uint8Array
    // note: cannot use TextEncoder().encode(saltStr) as it generates UTF-8
    const iterHex = iterStr.match(/./g).map(ch => ch.charCodeAt(0).toString(16)).join('')               // iter’n count as hex
    const iterations = parseInt(iterHex, 16)                                                            // iter’ns
    // -- generate new key from stored salt & iterations and supplied password
    const pwUtf8 = new TextEncoder().encode(password)                                                   // encode pw as UTF-8
    const pwKey = await crypto.subtle.importKey('raw', pwUtf8, 'PBKDF2', false, ['deriveBits'])         // create pw key
    const params = { name: 'PBKDF2', hash: `SHA-${hashBits}`, salt: saltUint8, iterations: iterations } // pbkdf params
    const keyBuffer = await crypto.subtle.deriveBits(params, pwKey, hashBits)                           // derive key
    const keyArray = Array.from(new Uint8Array(keyBuffer))                                      // key as byte array
    const keyStrNew = keyArray.map(byte => String.fromCharCode(byte)).join('')                  // key as string

    return keyStrNew === keyStr // test if newly generated key matches stored key
}

export async function pbkdf2(password, iterations = 1e5, hashBits = 512) {
    const pwUtf8 = new TextEncoder().encode(password)                                                   // encode pw as UTF-8
    const pwKey = await crypto.subtle.importKey('raw', pwUtf8, 'PBKDF2', false, ['deriveBits'])         // create pw key
    const saltUint8 = crypto.getRandomValues(new Uint8Array(16))                                        // get random salt
    const params = { name: 'PBKDF2', hash: `SHA-${hashBits}`, salt: saltUint8, iterations: iterations } // pbkdf2 params
    const keyBuffer = await crypto.subtle.deriveBits(params, pwKey, hashBits)                           // derive key
    const keyArray = Array.from(new Uint8Array(keyBuffer))                                              // key as byte array
    const saltArray = Array.from(new Uint8Array(saltUint8))                                             // salt as byte array
    const iterHex = ('000000' + iterations.toString(16)).slice(-6)                                      // iter’n count as hex
    const iterArray = iterHex.match(/.{2}/g).map(byte => parseInt(byte, 16))                            // iter’ns as byte array
    const compositeArray = [].concat(saltArray, iterArray, keyArray)                                    // combined array
    const compositeStr = compositeArray.map(byte => String.fromCharCode(byte)).join('')                 // combined as string

    return btoa('v01' + compositeStr)
}

export function isSPDX(input) {
    const supportedVersions = ["SPDX-2.3"]
    let spdx
    if (typeof input === "string" && isJSON(input)) {
        spdx = JSON.parse(input)
    } else {
        spdx = Object.assign({}, input)
    }
    if (typeof spdx?.spdxVersion === 'undefined' || typeof spdx?.SPDXID === 'undefined') {
        return false
    }
    if (!supportedVersions.includes(spdx.spdxVersion)) {
        throw `Provided SPDX version ${spdx.spdxVersion} is not supported. Must be one of: ${supportedVersions}`
    }
    if (typeof spdx?.name === 'undefined' ||
        typeof spdx?.dataLicense === 'undefined' ||
        typeof spdx?.documentNamespace === 'undefined' ||
        typeof spdx?.creationInfo?.creators === 'undefined' ||
        !spdx?.creationInfo?.creators.length
    ) {
        return false
    }
    return true
}

export function isSARIF(input) {
    const supportedVersions = ["2.1.0"]
    let sarif
    if (typeof input === "string" && isJSON(input)) {
        sarif = JSON.parse(input)
    }
    if (typeof input?.$schema === 'undefined' || typeof input?.version === 'undefined') {
        return false
    }
    sarif = Object.assign({}, input)
    if (!supportedVersions.includes(sarif.version)) {
        throw `Provided SARIF version ${sarif.version} is not supported. Must be one of: ${supportedVersions}`
    }
    if (typeof sarif?.runs === 'undefined' || !sarif.runs.length) {
        throw `Provided SARIF was empty`
    }
    for (const run in sarif.runs) {
        if (typeof run?.results === 'undefined' || !run.results.length) {
            continue
        }
        if (typeof run?.tool?.driver?.name === 'undefined') {
            return false
        }
        if (typeof run?.tool?.driver?.rules === 'undefined' ||
            !run.tool.driver.rules.length
        ) {
            return false
        }
        for (const rule in run.tool.driver.rules) {
            if (typeof rule?.defaultConfiguration?.level === 'undefined' ||
                typeof rule?.fullDescription?.text === 'undefined' ||
                typeof rule?.help?.text === 'undefined' ||
                typeof rule?.properties?.precision === 'undefined' ||
                typeof rule?.shortDescription?.text === 'undefined' ||
                typeof rule?.name === 'undefined'
            ) {
                return false
            }
        }
        for (const extension in run.extensions) {
            if (typeof extension?.name === 'undefined' ||
                typeof extension?.rules === 'undefined' ||
                !extension.rules.length
            ) {
                return false
            }
            for (const rule in extension.rules) {
                if (typeof rule?.defaultConfiguration?.level === 'undefined' ||
                    typeof rule?.fullDescription?.text === 'undefined' ||
                    typeof rule?.help?.text === 'undefined' ||
                    typeof rule?.properties?.precision === 'undefined' ||
                    typeof rule?.shortDescription?.text === 'undefined' ||
                    typeof rule?.name === 'undefined'
                ) {
                    return false
                }
            }
        }
    }
    return true
}

export const appExpiryPeriod = (86400000 * 365 * 10)  // 10 years

export async function hex(text, name = "SHA-1") {
    return [...new Uint8Array(await crypto.subtle.digest({ name }, new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function UUID() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    )
}

export function isJSON(str) {
    try {
        return (JSON.parse(str) && !!str)
    } catch (e) {
        return false
    }
}

// https://octodex.github.com/images/
export const octodex = [
    "parentocats.png",
    "godotocat.png",
    "NUX_Octodex.gif",
    "yogitocat.png",
    "mona-the-rivetertocat.png",
    "manufacturetocat.png",
    "OctoAsians_dex_Full.png",
    "Octoqueer.png",
    "Terracottocat_Single.png",
    "Octogatos.png",
    "Adacats.png",
    "Fintechtocat.png",
    "Brennatocat.png",
    "filmtocats.png",
    "Sentrytocat_octodex.jpg",
    "puddle_jumper_octodex.jpg",
    "boxertocat_octodex.jpg",
    "surftocat.png",
    "hula_loop_octodex03.gif",
    "scubatocat.png",
    "vinyltocat.png",
    "tentocats.jpg",
    "snowtocat_final.jpg",
    "justicetocat.jpg",
    "blacktocats.png",
    "saint_nictocat.jpg",
    "mona-lovelace.jpg",
    "dinotocat.png",
    "bannekat.png",
    "catstello.png",
    "mcefeeline.jpg",
    "skatetocat.png",
    "bewitchedtocat.jpg",
    "inflatocat.png",
    "welcometocat.png",
    "filmtocat.png",
    "privateinvestocat.jpg",
    "gracehoppertocat.jpg",
    "gobbleotron.gif",
    "jetpacktocat.png",
    "minertocat.png",
    "saketocat.png",
    "luchadortocat.png",
    "saritocat.png",
    "topguntocat.png",
    "carlostocat.gif",
    "grinchtocat.gif",
    "maxtocat.gif",
    "yaktocat.png",
    "steroidtocat.png",
    "mummytocat.gif",
    "labtocat.png",
    "dunetocat.png",
    "octoliberty.png",
    "femalecodertocat.png",
    "daftpunktocat-thomas.gif",
    "daftpunktocat-guy.gif",
    "foundingfather_v2.png",
    "poptocat_v2.png",
    "Mardigrastocat.png",
    "kimonotocat.png",
    "Professortocat_v2.png",
    "goretocat.png",
    "Robotocat.png",
    "motherhubbertocat.png",
    "skitchtocat.png",
    "gangnamtocat.png",
    "droctocat.png",
    "spidertocat.png",
    "megacat-2.png",
    "dodgetocat_v2.png",
    "stormtroopocat.png",
    "pusheencat.png",
    "deckfailcat.png",
    "murakamicat.png",
    "homercat.png",
    "minion.png",
    "droidtocat.png",
    "octofez.png",
    "heisencat.png",
    "red-polo.png",
    "twenty-percent-cooler-octocat.png",
    "momtocat.png",
    "snowoctocat.png",
    "electrocat.png",
    "codercat.jpg",
    "strongbadtocat.png",
    "adventure-cat.png",
    "doctocat-brown.jpg",
    "dojocat.jpg",
    "defunktocat.png",
    "herme-t-crabb.png",
    "saint-nicktocat.jpg",
    "orderedlistocat.png",
    "thanktocat.png",
    "megacat.jpg",
    "linktocat.jpg",
    "plumber.jpg",
    "octotron.jpg",
    "baracktocat.jpg",
    "octocat-de-los-muertos.jpg",
    "grim-repo.jpg",
    "father_timeout.jpg",
    "waldocat.png",
    "hipster-partycat.jpg",
    "riddlocat.png",
    "visionary.jpg",
    "oktobercat.png",
    "shoptocat.png",
    "nyantocat.gif",
    "octdrey-catburn.jpg",
    "spectrocat.png",
    "bear-cavalry.png",
    "andycat.jpg",
    "notocat.jpg",
    "dodgetocat.jpg",
    "cloud.jpg",
    "scarletteocat.jpg",
    "poptocat.png",
    "jenktocat.jpg",
    "xtocat.jpg",
    "chellocat.jpg",
    "cherryontop-o-cat.png",
    "supportcat.png",
    "collabocats.jpg",
    "constructocat2.jpg",
    "total-eclipse-of-the-octocat.jpg",
    "pacman-ghosts.jpg",
    "okal-eltocat.jpg",
    "octoclark-kentocat.jpg",
    "agendacat.png",
    "ironcat.jpg",
    "inspectocat.jpg",
    "jean-luc-picat.jpg",
    "spocktocat.png",
    "wilson.jpg",
    "swagtocat.png",
    "hubot.jpg",
    "monroe.jpg",
    "trekkie.png",
    "octonaut.jpg",
    "bouncercat.png",
    "founding-father.jpg",
    "pythocat.png",
    "drupalcat.jpg",
    "socialite.jpg",
    "setuptocat.jpg",
    "repo.png",
    "forktocat.jpg",
    "benevocats.png",
    "scottocat.jpg",
    "puppeteer.png",
    "octobiwan.jpg",
    "class-act.png",
    "original.png",
    "idokungfoo-avatar.jpg",
]
