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

export class CloudFlare {
    constructor() {

    }
    async d1all(db, sql, bind) {
        const { results } = await db.prepare(sql).bind(bind).all()

        return results
    }
    async r2get(db, objectKey, uploadedAfter) {
        const options = {
            conditional: {
                uploadedAfter,
            },
        }

        return await db.get(objectKey, options)
    }
    async r2list(db, prefix = '/', limit = 1000) {
        const options = {
            limit,
            prefix,
            include: ['customMetadata'],
        }

        const listed = await db.list(options)

        let { truncated } = listed
        let cursor = truncated ? listed.cursor : undefined

        while (truncated) {
            const next = await db.list({
                ...options,
                cursor: cursor,
            })

            listed.objects.push(...next.objects)

            truncated = next.truncated
            cursor = next.cursor
        }

        return listed.objects
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
        console.log(url)
        const response = await fetch(url, { headers: this.headers })
        if (!response.ok) {
            console.error(`resp headers=${JSON.stringify(this.headers, null, 2)}`)
            console.error(await response.text())
            console.error(`GitHub error! status: ${response.status} ${response.statusText}`)
        }
        try {
            const content = await response.json()
            return { ok: response.ok, status: response.status, statusText: response.statusText, content }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`)

            return { ok: response.ok, status: response.status, statusText: response.statusText, content: await response.text(), error: { message: e.message, lineno, colno } }
        }
    }
    async fetchSARIF(url) {
        console.log(url)
        const headers = Object.assign(this.headers, { 'Accept': 'application/sarif+json' })
        const response = await fetch(url, { headers })
        if (!response.ok) {
            console.error(`resp headers=${JSON.stringify(response.headers, null, 2)}`)
            console.error(await response.text())
            console.error(`GitHub error! status: ${response.status} ${response.statusText}`)
        }
        try {
            const content = await response.json()
            return { ok: response.ok, status: response.status, statusText: response.statusText, content }
        } catch (e) {
            const [, lineno, colno] = e.stack.match(/(\d+):(\d+)/);
            console.error(`line ${lineno}, col ${colno} ${e.message}`)

            return { ok: response.ok, status: response.status, statusText: response.statusText, content: await response.text(), error: { message: e.message, lineno, colno } }
        }
    }
    async getRepoSarif(full_name, memberEmail, db) {
        // https://docs.github.com/en/rest/code-scanning/code-scanning?apiVersion=2022-11-28#list-code-scanning-analyses-for-a-repository
        const files = []
        const perPage = 100
        let page = 1

        while (true) {
            const url = `${this.baseUrl}/repos/${full_name}/code-scanning/analyses?per_page=${perPage}&page=${page}`
            const data = await this.fetchJSON(url)
            if (!data?.ok) {
                data.url = url
                const info = await db.prepare(`
                    INSERT OR REPLACE INTO audit (
                    memberEmail,
                    action,
                    actionTime,
                    additionalData) VALUES (?1, ?2, ?3, ?4)`)
                    .bind(
                        memberEmail,
                        'github_sarif',
                        +new Date(),
                        JSON.stringify(data)
                    )
                    .run()
                console.log(`github.getRepoSarif(${full_name}) ${data.status} ${data.statusText}`, data.content, info)
                break
            }
            for (const report of data.content) {
                const sarifUrl = `${this.baseUrl}/repos/${full_name}/code-scanning/analyses/${report.id}`
                const sarifData = await this.fetchSARIF(sarifUrl)
                if (!sarifData?.ok) {
                    sarifData.url = sarifUrl
                    const info = await db.prepare(`
                        INSERT OR REPLACE INTO audit (
                        memberEmail,
                        action,
                        actionTime,
                        additionalData) VALUES (?1, ?2, ?3, ?4)`)
                        .bind(
                            memberEmail,
                            'github_sarif',
                            +new Date(),
                            JSON.stringify(sarifData)
                        )
                        .run()
                    console.log(`github.getRepoSarif(${full_name}) ${sarifData.status} ${sarifData.statusText}`, sarifData.content, info)
                    break
                }
                files.push({
                    full_name,
                    report: Object.assign({}, report),
                    sarif: Object.assign({}, sarifData.content)
                })
            }

            if (data.content.length < perPage) {
                break
            }

            page++
        }

        return files
    }
    async getRepos(memberEmail, db) {
        // https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repositories-for-the-authenticated-user
        const repos = []
        const perPage = 100
        let page = 1

        while (true) {
            const url = `${this.baseUrl}/user/repos?per_page=${perPage}&page=${page}`
            const data = await this.fetchJSON(url)
            if (!data?.ok) {
                data.url = url
                const info = await db.prepare(`
                    INSERT OR REPLACE INTO audit (
                    memberEmail,
                    action,
                    actionTime,
                    additionalData) VALUES (?1, ?2, ?3, ?4)`)
                    .bind(
                        memberEmail,
                        'github_repos',
                        +new Date(),
                        JSON.stringify(data)
                    )
                    .run()
                console.log(`github.getRepos() ${data.status} ${data.statusText}`, data.content, info)
                break
            }
            repos.push(...data.content)

            if (data.content.length < perPage) {
                break
            }

            page++
        }

        return repos
    }
    async getBranch(repo, branch) {
        // https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
        return await this.fetchJSON(`${this.baseUrl}/repos/${repo.full_name}/branches/${branch}`)
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

        return branches
    }
    async getCommit(full_name, commit_sha) {
        // https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28
        return await this.fetchJSON(`${this.baseUrl}/repos/${full_name}/commits/${commit_sha}`)
    }
    async getCommits(full_name, branch_name) {
        // https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28
        const commits = []
        const perPage = 100
        let page = 1

        while (true) {
            const currentCommits = await this.fetchJSON(`${this.baseUrl}/repos/${full_name}/commits?sha=${branch_name}&per_page=${perPage}&page=${page}`)

            commits.push(...currentCommits)

            if (currentCommits.length < perPage) {
                break
            }

            page++
        }

        return commits
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
            console.error(`line ${lineno}, col ${colno} ${e.message}`)

            return { exists: false, ok: response.ok, status: response.status, statusText: response.statusText, content: await response.text(), error: { message: e.message, lineno, colno } }
        }
    }
}
