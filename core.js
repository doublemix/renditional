const camelToKebab = (source) => {
    return source.replace(/[A-Z]/g, x => "-" + x.toLowerCase())
}

class DependencyTracker {
    constructor () {
        this.dependentStack = []
    }
    with (dependent, callback) {
        this.dependentStack.unshift(dependent)
        callback()
        this.dependentStack.shift()
    }

    referenced (dependency) {
        if (this.dependentStack.length > 0) {
            this.dependentStack[0].addDependency(dependency)
        }
    }
}

export class Dependency {
    constructor () {
        this.dependents = []
    }

    referenced () {
        Deps.referenced(this)
    }

    updated () {
        this.dependents.slice().forEach((dependent) => {
            dependent.onDependencyUpdated();
        })
    }

    addDependent (dependent) {
        if (!this.dependents.includes(dependent)) {
            this.dependents.push(dependent)
        }
    }

    removeDependent (dependent) {
        const index = this.dependents.indexOf(dependent)
        if (index >= 0) {
            this.dependents.splice(index, 1)
        }
    }
}

export class Dependent {
    constructor (callback) {
        this.dependencies = []
        this.callback = callback
        this.isCancelled = false
    }

    registerCallback (callback) {
        this.callback = callback
    }

    addDependency (dependency) {
        if (this.isCancelled) return;
        if (!this.dependencies.includes(dependency)) {
            dependency.addDependent(this)
            this.dependencies.push(dependency)
        }
    }

    clearDependencies () {
        this.dependencies.forEach((dependency) => {
            dependency.removeDependent(this)
        })
        this.dependencies.length = 0
    }

    with (callback, shouldClearDependencies = true) {
        if (shouldClearDependencies) this.clearDependencies()
        let result
        Deps.with(this, () => { result = callback() })
        return result
    }

    onDependencyUpdated () {
        if (this.isCancelled) return;
        (0, this.callback)()
    }

    cancel () {
        this.isCancelled = true
        this.clearDependencies()
    }
}

const Deps = new DependencyTracker()

export const ref = initialValue => {
    const dep = new Dependency();

    let value = initialValue

    return {
        get current () {
            dep.referenced();
            return value
        },
        set current (newValue) {
            value = newValue
            dep.updated();
        },
        get value () {
            return value
        },
        set value (newValue) {
            value = newValue
        },
        refresh () {
            dep.updated();
        }
    }
}

class Section {
    constructor (commentNode) {
        this.commentNode = commentNode
    }

    appendChild (element) {
        this.commentNode.parentNode.insertBefore(element, this.commentNode)
    }

    removeChild (element) {
        this.commentNode.parentNode.removeChild(element)
    }

    insertBefore (newElement, insertBeforeElement) {
        this.commentNode.parentNode.insertBefore(newElement, insertBeforeElement ?? this.commentNode)
    }
}

export const makeDestroyer = () => {
    const destroyCallbacks = []
    let destroyed = false

    function destroy (callback) {
        if (destroyed) throw new Error("attempt to register destroy callback, when already destroyed")
        destroyCallbacks.unshift(callback)
    }

    function destroyer () {
        if (destroyed) throw new Error("attempt to destroy when already destroyed")
        try {

            destroyCallbacks.slice().forEach(cb => {
                cb()
            })
        } finally {

            destroyed = true
        }
    }

    destroyer.destroy = destroy

    return destroyer
}

export const maybe = (calculateShown, construct) => {
    return new StandardEffect((root, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const comment = document.createComment("")
        root.appendChild(comment)
        destroy(() => root.removeChild(comment))

        const section = new Section(comment)

        let currentShown = dependent.with(() => {
            return maybeCall(calculateShown)
        })

        let currentDestroyer = null

        if (currentShown) {
            currentDestroyer = makeDestroyer()
            render(section, maybeCall(construct), currentDestroyer.destroy)
        }

        dependent.registerCallback(() => {
            const nextShown = dependent.with(() => {
                return maybeCall(calculateShown)
            })

            if (nextShown && !currentShown) {
                currentDestroyer = makeDestroyer()
                render(section, maybeCall(construct), currentDestroyer.destroy)
            }

            if (!nextShown && currentShown) {
                currentDestroyer()
                currentDestroyer = null
            }
            
            currentShown = nextShown
        })

        destroy(() => currentDestroyer?.())
    })
}

export const map = (calculateIterable, mapper) => {
    return new StandardEffect((root, destroy) => {
        const dependent = new Dependent(run)
        destroy(() => dependent.cancel())

        const startOfMap = document.createComment("map")
        root.appendChild(startOfMap)
        destroy(() => root.removeChild(startOfMap))
        
        let currentItems = []
        destroy(() => currentItems.forEach(item => item.destroyer()))
        
        function run () {
            let newItems = []

            Deps.with(dependent, () => {
                for (const value of maybeCall(calculateIterable)) {
                    if (newItems.some(x => x.value === value)) continue; // no duplicates

                    const item = {
                        value,
                        destroyer: null,
                        section: null,
                    }

                    newItems.push(item)
                }
            })

            let currentIndex = 0
            let newIndex = 0

            function getStartNode (currentIndex) {
                let actualIndex = currentIndex - 1
                let startNode = actualIndex === -1 ? startOfMap : currentItems[actualIndex].commentNode
                return startNode
            }

            while (newIndex < newItems.length || currentIndex < currentItems.length) {
                // does the current item have a match, if not then destroy
                if (currentIndex < currentItems.length) {
                    const currentItem = currentItems[currentIndex]
                    const matchingIndex = newItems.findIndex(x => x.value === currentItem.value)
                    if (matchingIndex === -1) {
                        currentItem.destroyer()
                        currentItems.splice(currentIndex, 1)
                        continue;
                    }
                }

                if (newIndex < newItems.length) {
                    const newItem = newItems[newIndex]
                    const matchingIndex = currentItems.findIndex(x => x.value === newItem.value)
                    if (matchingIndex === -1) {
                        // brand new item
                        newItem.destroyer = makeDestroyer()
                        newItem.commentNode = document.createComment("map item")
                        // newItem.destroyer.destroy()
                        newItem.section = new Section(newItem.commentNode)
                        
                        const insertBeforeNode = getStartNode(currentIndex).nextSibling
                        root.insertBefore(newItem.commentNode, insertBeforeNode)
                        newItem.destroyer.destroy(() => root.removeChild(newItem.commentNode))

                        render(newItem.section, mapper(newItem.value), newItem.destroyer.destroy)

                        currentItems.splice(currentIndex, 0, newItem)

                        currentIndex++
                        newIndex++
                    } else {
                        if (matchingIndex !== currentIndex) {
                            // move
                            const matchingItem = currentItems[matchingIndex]
                            const elementsToMove = []
                            const startNode = getStartNode(matchingIndex)
                            const endNode = matchingItem.commentNode

                            let currentNode = startNode
                            while (currentNode !== endNode) {
                                currentNode = currentNode.nextSibling
                                elementsToMove.push(currentNode)
                            }

                            const insertBeforeNode = getStartNode(currentIndex).nextSibling
                            
                            for (const element of elementsToMove) {
                                root.insertBefore(element, insertBeforeNode)
                            }

                            currentItems.splice(matchingIndex, 1)
                            currentItems.splice(currentIndex, 0, matchingItem)

                            currentIndex++
                            newIndex++
                        } else {
                            currentIndex++
                            newIndex++
                        }
                    }
                }
            }

            // TODO delete, or move to testing suite
            function assertUpdateWasSuccessful () {
                try {
                    if (currentItems.length !== newItems.length) throw new Error(`map update failure: length mismatch, expected: ${newItems.length}, got: ${currentItems.length}`)
                    let i = 0
                    while (i < currentItems.length) {
                        if (currentItems[i].value !== newItems[i].value)
                            throw new Error("map update failure: mismatch in items at index " + i)
                        i++
                    }

                    i = 0
                    while (i < currentItems.length - 1) {
                        if (currentItems[i].commentNode.compareDocumentPosition(currentItems[i + 1].commentNode) & Node.DOCUMENT_POSITION_FOLLOWING === 0) {
                            throw new Error("map update failure: nodes are out-of-order at index " + i)
                        }
                        i++
                    }
                } catch (err) {
                    console.error("misatched map", currentItems, newItems)
                    throw err
                }
            }

            // TODO only run on test
            assertUpdateWasSuccessful()
        }
        
        run()
    })
}

export class Effect {
    apply (root, destroy) {
        throw new Error("Abstract method Effect.apply called directly")
    }
}

export class StandardEffect extends Effect {
    constructor (applyCb) {
        super()
        this.applyCb = applyCb
    }

    apply (root, destroy) {
        (0, this.applyCb)(root, destroy)
    }
}

export const createEffect = (effectFn) => {
    return new StandardEffect(effectFn)
}

function createPropertyBasedProxy (valueCreator) {
    return new Proxy({}, {
        get(target, property, _) {
            if (!target[property]) {
                target[property] = { value: valueCreator(property) }
            }
            return target[property].value
        }
    })
}

export const el = createPropertyBasedProxy(camelCaseTagName => {
    const tagName = camelToKebab(camelCaseTagName)

    function self(...children) {
        return new StandardEffect((root, destroy) => {
            const element = document.createElement(tagName)

            root.appendChild(element)

            destroy(() => root.removeChild(element))

            render(element, children, destroy)
        })
    }

    return self
})

export const att = createPropertyBasedProxy(camelCaseAttributeName => {
    const attributeName = camelToKebab(camelCaseAttributeName)

    function self(calculateValue) {
        return new StandardEffect((root, destroy) => {
            const dependent = new Dependent()
            destroy(() => dependent.cancel())
            
            function run () {
                let currentComputedValue
                Deps.with(dependent, () => {
                    currentComputedValue = maybeCall(calculateValue)
                })

                if (typeof currentComputedValue === 'boolean') {
                    if (currentComputedValue) {
                        root.setAttribute(attributeName, '')
                    } else {
                        if (root.hasAttribute(attributeName))
                            root.removeAttribute(attributeName)
                    }
                } else {
                    root.setAttribute(attributeName, currentComputedValue?.toString())
                }
            }

            dependent.registerCallback(run)

            run()
        })
    }

    return self
})

export const on = createPropertyBasedProxy(camelCaseEventName => {
    const eventName = camelToKebab(camelCaseEventName)
    
    function self(listener) {
        return new StandardEffect((root, destroy) => {
            root.addEventListener(eventName, listener)

            destroy(() => root.removeEventListener(eventName, listener))
        })
    }

    return self
})

export const text = (valueCreator) => {
    return new StandardEffect((root, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const initialValue = dependent.with(() => {
            return maybeCall(valueCreator)
        })

        const textNode = document.createTextNode(initialValue)

        root.appendChild(textNode)
        destroy(() => root.removeChild(textNode))

        dependent.registerCallback(() => {
            const newValue = dependent.with(() => {
                return maybeCall(valueCreator)
            })

            textNode.textContent = newValue
        })
    })
}

const maybeCall = (valueOrFn, ...args) => {
    if (typeof valueOrFn === 'function') {
        return valueOrFn(...args)
    }
    return valueOrFn
}

const noop = () => {}

export const render = (root, template, destroy = noop) => {
    if (template instanceof Array) {
        for (const item of template)
            render(root, item, destroy)
    } else if (template instanceof Effect) {
        template.apply(root, destroy)
    } else if (typeof template === 'function') {
        throw new Error("Function template not supported, currently")
    } else if (template === null || typeof template === 'string' || typeof template === 'number' || typeof template === 'boolean') {
        const textNode = document.createTextNode(template)
        root.appendChild(textNode)
        destroy(() => root.removeChild(textNode))
    } else {
        root.appendChild(template)
        destroy(() => root.removeChild(template))
    }
}
