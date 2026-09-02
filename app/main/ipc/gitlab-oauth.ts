import { ipcMain, IpcMainInvokeEvent, shell } from "electron"
import { getLocalAppData, writeLocal } from "../helpers/requests"

const CLIENT_ID = "f2c1987f7927b191dd347e4754f0ab5e52a633083b9994476a29cdb0b91eb145"

const GITLAB_BASE_URL = "https://gitlab.com"

const DEVICE_CODE_URL = `${GITLAB_BASE_URL}/oauth/authorize_device`
const TOKEN_URL = `${GITLAB_BASE_URL}/oauth/token`
const USER_URL = `${GITLAB_BASE_URL}/api/v4/user`

interface DeviceCodeResponse {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

interface TokenResponse {
    refresh_token?: string;
    access_token?: string
    token_type?: string
    scope?: string
    error?: string
    error_description?: string
}

interface GitLabUser {
    login: string
    name: string | null
    avatar_url: string
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
    const formBody = Object.entries(body)
        .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
        .join("&")

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        },
        body: formBody
    })

    return res.json()
}

async function fetchUser(token: string): Promise<GitLabUser | null> {
    try {
        const res = await fetch(USER_URL, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        })

        if (!res.ok) return null

        return await res.json() as GitLabUser
    } catch {
        return null
    }
}

ipcMain.handle("gitlab-oauth-start", async (_: IpcMainInvokeEvent) => {
    try {
        const data: DeviceCodeResponse = await postForm(DEVICE_CODE_URL, {
            client_id: CLIENT_ID,
            scope: 'read_user'
        })

        if (!data.device_code || !data.user_code) {
            console.log('gitlab start error')
            return { success: false, error: "Failed to start device flow" }
        }

        shell.openExternal(data.verification_uri)

        return {
            success: true,
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            expiresIn: data.expires_in,
            interval: data.interval
        }
    } catch (err: any) {
        return { success: false, error: err.message || "Unknown error" }
    }
})

ipcMain.handle("gitlab-oauth-poll", async (_: IpcMainInvokeEvent, deviceCode: string) => {
    try {
        const data: TokenResponse = await postForm(TOKEN_URL, {
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })

        console.log('gitlab poll', data)

        if (data.access_token) {
            const user = await fetchUser(data.access_token)

            writeLocal({
                gitlabOAuthToken: data.access_token,
                gitlabOAuthRefreshToken: data.refresh_token,
                gitlabOAuthUser: user
            })

            return { success: true, token: data.access_token, user }
        }

        if (data.error === "authorization_pending") {
            return { success: false, status: "pending" }
        }
        if (data.error === "slow_down") {
            return { success: false, status: "slow_down" }
        }
        if (data.error === "expired_token") {
            return { success: false, status: "expired" }
        }
        if (data.error === "access_denied") {
            return { success: false, status: "denied" }
        }

        return { success: false, status: "error", error: data.error_description || data.error }
    } catch (err: any) {
        return { success: false, status: "error", error: err.message || "Unknown error" }
    }
})

ipcMain.handle("gitlab-oauth-get-user", async (_: IpcMainInvokeEvent) => {
    const local = getLocalAppData()

    if (local.gitlabOAuthToken && local.gitlabOAuthUser) {
        return { success: true, user: local.gitlabOAuthUser }
    }

    if (local.gitlabOAuthToken) {
        const user = await fetchUser(local.gitlabOAuthToken)

        if (user) {
            writeLocal({ gitlabOAuthUser: user })
            return { success: true, user }
        }
    }

    return { success: false, user: null }
})

ipcMain.handle("gitlab-oauth-disconnect", async (_: IpcMainInvokeEvent) => {
    const local = getLocalAppData()
    if (local.gitlabOAuthToken) {
        await postForm(`${GITLAB_BASE_URL}/oauth/revoke`, {
        client_id: CLIENT_ID,
        token: local.gitlabOAuthToken
        }).catch(() => {})
    }
    writeLocal({
        gitlabOAuthToken: "",
        gitlabOAuthUser: null
    })

    return { success: true }
})
