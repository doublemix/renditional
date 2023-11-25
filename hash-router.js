import { makeDestroyer, render, StandardEffect } from 'renditional'

export const router = (routeMap, template404 = () => []) => {
    return new StandardEffect((node, destroy) => {
        let currentDestroyer
        destroy(() => currentDestroyer?.())

        function syncHash() {
            let hashLocation = document.location.hash.split('#')[1]

            if (!hashLocation) {
                hashLocation = '/';
            }

            let next

            if (!(Object.prototype.hasOwnProperty.call(routeMap, hashLocation))) {
                next = template404(hashLocation)
            } else {
                next = (0, routeMap[hashLocation])()
            }

            currentDestroyer?.()

            currentDestroyer = makeDestroyer()

            render(node, next, currentDestroyer.destroy)

        }
        syncHash()

        window.addEventListener("hashchange", syncHash)
        destroy(() => window.removeEventListener("hashchange", syncHash))
    })
}
