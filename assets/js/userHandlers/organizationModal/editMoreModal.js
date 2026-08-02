import { sendEvent } from "../../bus.js";
import { createNotify, GLS } from "../../lib.js";
import { Modal } from "../../modalsHandler/engine.js";

export async function renderEditMoreModal({ name, id, description, parentModal }) {
    const gls = await GLS.initLocal()

    function lgls(string, replacements = {}) {
        return gls.get(`modals.organizations.editOrgMore.${string}`, replacements)
    }

    const changeNameModal = Modal.create({
        id: "changeOrgName",
        name: "changeOrgName",
        modalClassList: ["window"],
        size: "mini",
        title: lgls("title", { name: name }),

        content: [
            {
                type: "row-clear",
                gap: 15,
                classList: ['background'],
                items: [
                    {
                        type: "placeholder",
                        title: lgls("body.title"),
                        description: lgls("body.description")
                    },

                    {
                        type: "divider"
                    },

                    {
                        type: "input",
                        id: "editOrgMoreName",
                        placeholder: lgls("inputs.name.value"),
                        value: name,
                        maxSymbols: 30
                    },
                    {
                        type: "input",
                        id: "editOrgMoreDesc",
                        placeholder: lgls("inputs.description.value"),
                        value: description,
                        maxSymbols: 200,

                        note: lgls("inputs.description.note")
                    },

                    {
                        type: "container",
                        id: "editOrgMoreButtonsContainer"
                    },
                    {
                        type: "button",
                        id: "editOrgNameConfirm",
                        title: lgls("buttons.ok"),
                        container: "#editOrgMoreButtonsContainer"
                    },
                    {
                        type: "button",
                        id: "editOrgNameCancel",
                        title: gls.get("cancel"),
                        container: "#editOrgMoreButtonsContainer",
                        class: "danger"
                    }
                ]
            },
        ]
    })

    changeNameModal.onClose(() => {
        parentModal.open()
    }, { once: true })

    changeNameModal.onOpen(() => {
        const nameEl = changeNameModal.selectID("editOrgMoreName")
        const descEl = changeNameModal.selectID("editOrgMoreDesc")
        const confirmBtn = changeNameModal.selectID("editOrgNameConfirm")

        confirmBtn.onClick(async () => {
            const thisName = nameEl.value()
            const thisDesc = descEl.value()
            
            const fields = {}

            if(thisName != name) {
                fields["name"] = thisName
                name = thisName
            }
            if(thisDesc != description) {
                fields["description"] = thisDesc
                description = thisDesc
            }

            const res = await window.electron.editOrg(id, fields)

            if(res.success) {
                changeNameModal.close()
                sendEvent("org-update", {})
            }
            else {
                createNotify({
                    type: "danger",
                    icon: "cancel",
                    title: lgls("errors.update.title"),
                    content: String(res.msg)
                })
            }
        })
    })

    return changeNameModal
}