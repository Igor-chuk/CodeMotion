import { GLS } from "../../lib.js";
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

    const element = changeNameModal.el

    changeNameModal.onClose(() => {
        parentModal.open()
    }, { once: true })

    return changeNameModal
}