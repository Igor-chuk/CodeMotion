export type SaveContentPayload = {
    filename: string
    content: string
}
export type RunPythonPayload = {
    code: string,
    filePath: string, 
    useEmbed: boolean
}
export type EditOrgData = {
    orgid: number,
    name: string,
    description: string
}