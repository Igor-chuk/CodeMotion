import { bus } from "../../../bus.js"
import { Languages } from "../../../lib.js"

export function onLanguageRegisterCallback({ data }) {
    const name = data.languageName
    const displayName = data.languageDisplayName
    const extensions = data.languageExtensions
    const rules = data.languageRules
    const iconPath = data.languageIconPath
    
    // bus.addEventListener("aceModeChanged", (e) => {
    //     let data = e.detail
    //     let extension = data.extension
    //     let editor = data.editor

    //     if ("errors" in rules) {
    //         if (rules.errors) {
    //             enableErrors(editor)
    //         }
    //         else {
    //             disableErrors(editor)
    //         }
    //     }
    // })

    // registerAceLanguage(name, rules)

    // const languageObject = {
    //     name: displayName,
    //     icon: iconPath,
    //     customIcon: true,
    //     mode: name
    // }

    // if ("mode" in rules) {
    //     languageObject.mode = rules.mode
    // }

    // extensions.forEach(id => {
    //     languageObject.id = id
    //     Languages.add(languageObject)
    // })
}