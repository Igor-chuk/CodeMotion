import { GetOrgAvatar, GLS } from "../../../lib.js";
import { Modal } from "../../../modalsHandler/engine.js";
import { renderAboutPage } from "./about.js";

export async function createOrgPage(
    { 
        id, name, avatarID, description, verified, 
        ownerID, members_count, created_at,
        github_repos, website, parentModal
    }
) {
    Modal.destroy("orgPage")

    const gls = GLS.initLocal()

    function lgls(key, replacements = {}) {
        return gls.get(`modals.organizations.orgPage.${key}`, replacements)
    }

    const avatar = await GetOrgAvatar.get(avatarID, "large")
    const data = {
        id: id,
        name: name,
        avatar: avatar,
        description: description,
        verified: verified,
        ownerID: ownerID,
        members_count: members_count,
        created_at: created_at,
        github_repos: github_repos,
        website: website
    }

    const modal = Modal.create(
        {
            id: "orgPage",
            name: name,
            modalClassList: ["window"],
            title: name,
            titleAvatar: avatar,

            pages: [
                {
                    name: lgls("about.title"),
                    icon: "info",

                    content: [
                        {
                            type: "row-clear",
                            gap: 10,
                            items: await renderAboutPage(lgls, data)
                        }
                    ]
                },
            ]
        }
    )

    modal.onClose(() => {
        parentModal.open()
    })

    return modal
}