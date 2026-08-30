import { ipcMain, IpcMainInvokeEvent, shell } from "electron"
import { getLocalAppData, writeLocal } from "../helpers/requests"

const CLIENT_ID = "Ov23limFNnXEgt4UxRRt"

const DEVICE_CODE_URL = "https://github.com/login/device/code"
const TOKEN_URL = "https://github.com/login/oauth/access_token"
const USER_URL = "https://api.github.com/user"

interface DeviceCodeResponse {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

interface TokenResponse {
    access_token?: string
    token_type?: string
    scope?: string
    error?: string
    error_description?: string
}

interface GitHubUser {
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

async function fetchUser(token: string): Promise<GitHubUser | null> {
    try {
        const res = await fetch(USER_URL, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        })

        if (!res.ok) return null

        return await res.json() as GitHubUser
    } catch {
        return null
    }
}

ipcMain.handle("github-oauth-start", async (_: IpcMainInvokeEvent) => {
    try {
        const data: DeviceCodeResponse = await postForm(DEVICE_CODE_URL, {
            client_id: CLIENT_ID,
            scope: "read:user public_repo"
        })

        if (!data.device_code || !data.user_code) {
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

ipcMain.handle("github-oauth-poll", async (_: IpcMainInvokeEvent, deviceCode: string) => {
    try {
        const data: TokenResponse = await postForm(TOKEN_URL, {
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })

        if (data.access_token) {
            const user = await fetchUser(data.access_token)

            writeLocal({
                githubOAuthToken: data.access_token,
                githubOAuthUser: user
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

ipcMain.handle("github-oauth-get-user", async (_: IpcMainInvokeEvent) => {
    const local = getLocalAppData()

    if (local.githubOAuthToken && local.githubOAuthUser) {
        return { success: true, user: local.githubOAuthUser }
    }

    if (local.githubOAuthToken) {
        const user = await fetchUser(local.githubOAuthToken)

        if (user) {
            writeLocal({ githubOAuthUser: user })
            return { success: true, user }
        }
    }

    return { success: false, user: null }
})

ipcMain.handle("github-oauth-disconnect", async (_: IpcMainInvokeEvent) => {
    writeLocal({
        githubOAuthToken: "",
        githubOAuthUser: null
    })

    return { success: true }
})
