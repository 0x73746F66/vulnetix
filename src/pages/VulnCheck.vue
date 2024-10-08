<script setup>
import { Client, isJSON } from '@/utils';
import { reactive } from 'vue';
import { useTheme } from 'vuetify';
import router from "../router";

// curl 'https://api.vulncheck.com/v3/index/vulncheck-kev' \
//     -H 'User-Agent: Vulnetix' \
//     -H 'Accept: application/json' \
//     -H 'Authorization: Bearer undefined' > ./vulncheck-kev.json

const client = new Client()
const { global } = useTheme()

const initialState = {
    error: "",
    warning: "",
    success: "",
    info: "",
    loading: false,
    apiKey: '',
    log: []
}
const state = reactive({
    ...initialState,
})
const clearAlerts = () => {
    state.error = ''
    state.warning = ''
    state.success = ''
    state.info = ''
}
class Controller {
    constructor() {
        this.refresh()
    }
    refresh = async () => {
        clearAlerts()
        state.loading = true
        try {
            const limit = 150
            const pageSize = 20
            let hasMore = true
            let skip = 0
            while (hasMore && skip <= limit) {
                const { data } = await client.get(`/vulncheck/log?take=${pageSize}&skip=${skip}`)
                if (data.ok) {
                    if (data?.results) {
                        data.results.map(r => state.log.push(r))
                    }
                } else if (typeof data === "string" && !isJSON(data)) {
                    break
                } else if (data?.error?.message) {
                    state.loading = false
                    state.error = data.error.message
                    return
                } else if (["Expired", "Revoked", "Forbidden"].includes(data?.result)) {
                    state.loading = false
                    state.info = data.result
                    setTimeout(() => router.push('/logout'), 2000)
                    return
                } else {
                    break
                }
                if (Object.keys(data.results).length < pageSize) {
                    hasMore = false
                } else {
                    skip += pageSize
                }
            }
        } catch (e) {
            console.error(e)
            state.error = `${e.code} ${e.message}`
        }
        state.loading = false
    }
    save = async () => {
        clearAlerts()
        state.loading = true
        try {
            const { data } = await client.post(`/vulncheck/integrate`, { apiKey: state.apiKey })
            state.loading = false

            if (typeof data === "string" && !isJSON(data)) {
                state.error = "Data could not be saved, please try again later."

                return
            }
            if (data?.error?.message) {
                state.error = data?.error?.message
            }
            if (["Expired", "Revoked", "Forbidden"].includes(data?.result)) {
                state.info = data.result

                return setTimeout(() => router.push('/logout'), 2000)
            }
            if (data.ok === true) {
                state.success = "Saved successfully."
            } else {
                state.info = data?.result || 'No change'
            }

            return
        } catch (e) {
            console.error(e)
            state.error = typeof e === "string" ? e : `${e.code} ${e.message}`
            state.loading = false
        }
    }
}

const controller = reactive(new Controller())
</script>

<template>
    <Vrow>
        <VCol cols="12">
            <VAlert
                v-if="state.error"
                color="error"
                icon="$error"
                title="Error"
                :text="state.error"
                border="start"
                variant="tonal"
            />
            <VAlert
                v-if="state.warning"
                color="warning"
                icon="$warning"
                title="Warning"
                :text="state.warning"
                border="start"
                variant="tonal"
            />
            <VAlert
                v-if="state.success"
                color="success"
                icon="$success"
                title="Success"
                :text="state.success"
                border="start"
                variant="tonal"
            />
            <VAlert
                v-if="state.info"
                color="info"
                icon="$info"
                title="Information"
                :text="state.info"
                border="start"
                variant="tonal"
            />
        </VCol>
    </Vrow>
    <VCard title="VulnCheck Integration">
        <VAlert
            v-if="!state.loading && !state.apiKey"
            color="info"
            icon="$info"
            title="Information"
            border="start"
            variant="tonal"
            closable
        >
            Create a FREE token to use the VulnCheck API, you can
            <a
                :class="global.name.value === 'dark' ? 'text-secondary' : 'text-primary'"
                href="https://vulncheck.com/settings/token/newtoken"
                target="_blank"
            >create API Tokens here.</a>
        </VAlert>

        <VCardText>
            <VForm @submit.prevent="() => { }">
                <p class="text-base font-weight-medium">
                    Request vulnerabilities related to a CPE (Common Platform Enumeration) URI string, or Package URL
                    Scheme (PURL)
                </p>
                <VRow>
                    <VCol
                        md="6"
                        cols="12"
                    >
                        <VTextField
                            :disabled="state.loading"
                            v-model="state.apiKey"
                            placeholder="vulncheck_xxxx...xxxx"
                            label="VulnCheck API Token"
                        />
                    </VCol>
                    <VCol
                        md="6"
                        cols="12"
                        class="d-flex flex-wrap gap-4"
                    >
                    </VCol>
                </VRow>
                <VRow>
                    <VCol
                        md="6"
                        cols="12"
                        class="d-flex flex-wrap gap-4"
                    >
                        <VBtn @click="controller.save">Save</VBtn>

                    </VCol>
                </VRow>
            </VForm>
        </VCardText>

        <VSkeletonLoader
            v-if="state.loading"
            type="table-row@10"
        />
        <VTable
            class="text-no-wrap"
            v-if="!state.loading && state.log.length"
        >
            <thead>
                <tr>
                    <th scope="col">
                        Event Type
                    </th>
                    <th scope="col">
                        Email
                    </th>
                    <th scope="col">
                        Browser
                    </th>
                    <th scope="col">
                        Webhook
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="(device, i) in state.log"
                    :key="i"
                >
                    <td>
                        {{ device.type }}
                    </td>
                    <td>
                        <VCheckbox
                            v-model="device.email"
                            @change="controller.save(device)"
                        />
                    </td>
                    <td>
                        <VCheckbox
                            v-model="device.browser"
                            @change="controller.save(device)"
                        />
                    </td>
                    <td>
                        <VCheckbox
                            v-model="device.webhook"
                            @change="controller.save(device)"
                        />
                    </td>
                </tr>
            </tbody>
        </VTable>
        <VAlert
            v-else
            color="primary"
            icon="pixelarticons-mood-sad"
            text="No log data to display"
            variant="tonal"
        />
        <VDivider />
    </VCard>
</template>

<style lang="scss" scoped>
.v-table {
    th {
        text-align: start !important;
    }
}
</style>
