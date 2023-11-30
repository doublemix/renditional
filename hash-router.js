import { makeDestroyer, render, StandardEffect } from 'renditional'

export const router = (routeMap, template404 = () => []) => {
    return new StandardEffect((node, onDestroy, componentCtx) => {
        let currentDestroyer
        onDestroy(() => currentDestroyer?.destroy())

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

            currentDestroyer?.destroy()

            currentDestroyer = makeDestroyer()

            render(node, next, currentDestroyer.onDestroy, componentCtx)

        }
        syncHash()

        window.addEventListener("hashchange", syncHash)
        onDestroy(() => window.removeEventListener("hashchange", syncHash))
    })
}
