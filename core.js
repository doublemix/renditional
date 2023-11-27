const camelToKebab = (source) => {
    return source.replace(/[A-Z]/g, x => "-" + x.toLowerCase())
}

const maybeCall = (valueOrFn, ...args) => {
    if (typeof valueOrFn === 'function') {
        return valueOrFn(...args)
    }
    return valueOrFn
}

const noop = () => {}

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
    constructor () {
        this.dependencies = []
        this.callback = null
        this.isCancelled = false
        this.timeoutId = null
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
        this.queueUpdate()
    }

    queueUpdate () {
        if (this.timeoutId === null) {
            this.timeoutId = setTimeout(() => {
                this.timeoutId = null

                if (!this.callback) {
                    console.warn('Unhandled dependent update')
                }
                (0, this.callback)()
            }, 0)
        }
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
            if (newValue !== value) {
                value = newValue
                dep.updated();
            }
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

export const computed = (getter, setter = null) => {
    const dependency = new Dependency()
    const dependent = new Dependent()

    let isDirty = true
    let value

    dependent.registerCallback(() => {
        isDirty = true
        dependency.updated()
    })

    return {
        get current () {
            dependency.referenced()

            if (isDirty) {
                value = dependent.with(() => {
                    return getter()
                })
                isDirty = false
            }

            return value
        },

        set current (newValue) {
            if (typeof setter !== 'function') {
                throw new TypeError('Cannot set `current` of read-only copmuted property')
            }
            setter(newValue)
        },
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
            destroyCallbacks.slice().forEach(callback => {
                callback()
            })
        } finally {
            destroyed = true
        }
    }

    destroyer.destroy = destroy

    return destroyer
}

export const maybe = (shown, construct) => {
    return new StandardEffect((node, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const comment = document.createComment("maybe")
        node.appendChild(comment)
        destroy(() => node.removeChild(comment))

        const section = new Section(comment)

        let currentShown = dependent.with(() => {
            return maybeCall(shown)
        })
        
        let currentDestroyer = null
        destroy(() => currentDestroyer?.())

        if (currentShown) {
            currentDestroyer = makeDestroyer()
            render(section, maybeCall(construct), currentDestroyer.destroy)
        }

        dependent.registerCallback(() => {
            const nextShown = dependent.with(() => {
                return maybeCall(shown)
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
    })
}

export const map = (iterable, mapper) => {
    return new StandardEffect((node, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const startOfMap = document.createComment("map")
        node.appendChild(startOfMap)
        destroy(() => node.removeChild(startOfMap))
        
        let currentItems = []
        destroy(() => currentItems.forEach(item => item.destroyer()))

        dependent.registerCallback(run)

        run()
        
        function run () {
            let newItems = []

            Deps.with(dependent, () => {
                for (const value of maybeCall(iterable)) {
                    if (newItems.some(x => x.value === value)) continue; // no duplicates

                    const item = {
                        value,
                        destroyer: null,
                        section: null,
                    }

                    newItems.push(item)
                }
            })

            let index = 0

            function getStartNode (currentIndex) {
                let actualIndex = currentIndex - 1
                let startNode = actualIndex === -1 ? startOfMap : currentItems[actualIndex].commentNode
                return startNode
            }

            while (index < newItems.length || index < currentItems.length) {
                // does the current item have a match? if not then destroy
                if (index < currentItems.length) {
                    const currentItem = currentItems[index]
                    const matchingIndex = newItems.findIndex(x => x.value === currentItem.value)
                    if (matchingIndex === -1) {
                        currentItem.destroyer()
                        currentItems.splice(index, 1)
                        continue;
                    }
                }

                if (index < newItems.length) {
                    const newItem = newItems[index]
                    const matchingIndex = currentItems.findIndex(x => x.value === newItem.value)
                    if (matchingIndex === -1) {
                        // brand new item
                        newItem.destroyer = makeDestroyer()
                        newItem.commentNode = document.createComment("map item")
                        newItem.section = new Section(newItem.commentNode)
                        
                        const insertBeforeNode = getStartNode(index).nextSibling
                        node.insertBefore(newItem.commentNode, insertBeforeNode)
                        newItem.destroyer.destroy(() => node.removeChild(newItem.commentNode))

                        render(newItem.section, mapper(newItem.value), newItem.destroyer.destroy)

                        currentItems.splice(index, 0, newItem)

                        index++
                    } else {
                        if (matchingIndex !== index) {
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

                            const insertBeforeNode = getStartNode(index).nextSibling
                            
                            for (const element of elementsToMove) {
                                node.insertBefore(element, insertBeforeNode)
                            }

                            currentItems.splice(matchingIndex, 1)
                            currentItems.splice(index, 0, matchingItem)

                            index++
                        } else {
                            // item already in correct position in document
                            index++
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
    })
}

export class Effect {
    apply (node, destroy) {
        throw new Error("Abstract method Effect.apply called directly")
    }
}

export class StandardEffect extends Effect {
    constructor (applyCallback) {
        super()
        this.applyCallback = applyCallback
    }

    apply (node, destroy) {
        (0, this.applyCallback)(node, destroy)
    }
}

export const createEffect = (effectFn) => {
    return new StandardEffect(effectFn)
}

function createPropertyBasedProxy (valueCreator) {
    return new Proxy({}, {
        get(target, property) {
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
        return new StandardEffect((node, destroy) => {
            const element = document.createElement(tagName)

            node.appendChild(element)
            destroy(() => node.removeChild(element))

            render(element, children, destroy)
        })
    }

    return self
})

export const att = createPropertyBasedProxy(camelCaseAttributeName => {
    const attributeName = camelToKebab(camelCaseAttributeName)

    function self(calculateValue) {
        return new StandardEffect((node, destroy) => {
            const dependent = new Dependent()
            destroy(() => dependent.cancel())
            
            dependent.registerCallback(run)

            run()

            destroy(() => {
                if (node.hasAttribute(attributeName)) {
                    node.removeAttribute(attributeName)
                }
            })

            function run () {
                const currentComputedValue = dependent.with(() => {
                    return maybeCall(calculateValue)
                })

                if (typeof currentComputedValue === 'boolean') {
                    if (currentComputedValue) {
                        node.setAttribute(attributeName, '')
                    } else {
                        if (node.hasAttribute(attributeName))
                            node.removeAttribute(attributeName)
                    }
                } else {
                    node.setAttribute(attributeName, currentComputedValue?.toString())
                }
            }

        })
    }

    return self
})

export const on = createPropertyBasedProxy(camelCaseEventName => {
    const eventName = camelToKebab(camelCaseEventName)
    
    function self(listener) {
        return new StandardEffect((node, destroy) => {
            node.addEventListener(eventName, listener)
            destroy(() => node.removeEventListener(eventName, listener))
        })
    }

    return self
})

export const text = (valueCreator) => {
    return new StandardEffect((node, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const initialValue = dependent.with(() => {
            return maybeCall(valueCreator)
        })

        const textNode = document.createTextNode(initialValue)

        node.appendChild(textNode)
        destroy(() => node.removeChild(textNode))

        dependent.registerCallback(() => {
            const newValue = dependent.with(() => {
                return maybeCall(valueCreator)
            })

            textNode.textContent = newValue
        })
    })
}

const ComponentContext = {
    current: null,
}

export const component = (setUp) => {
    return new StandardEffect((node, destroy) => {

        const previousContext = ComponentContext.current
        ComponentContext.current = { destroy }
        let template
        try {
            template = setUp()
        } finally {
            ComponentContext.current = previousContext
        }
        render(node, template, destroy)
    })
}

export const useEffect = (effect) => {
    if (ComponentContext.current === null) {
        throw new TypeError("useEffect called outside of component setUp function")
    }

    const dependent = new Dependent()

    let currentDestroyer
    ComponentContext.current.destroy(() => currentDestroyer?.())

    dependent.registerCallback(run)

    run()

    function run () {
        currentDestroyer?.()

        currentDestroyer = makeDestroyer()

        dependent.with(() => {
            effect(currentDestroyer.destroy)
        })
    }
}

export const render = (node, template, destroy = noop) => {
    if (template instanceof Array) {
        for (const item of template)
            render(node, item, destroy)
    } else if (template instanceof Effect) {
        template.apply(node, destroy)
    } else if (typeof template === 'function') {
        throw new Error("Function template not supported, currently")
    } else if (template === null || typeof template === 'string' || typeof template === 'number' || typeof template === 'boolean') {
        const textNode = document.createTextNode(template)
        node.appendChild(textNode)
        destroy(() => node.removeChild(textNode))
    } else {
        throw new TypeError("Unexpected template value of type " + typeof template)
    }
}

// need to serve the JSX runtime
const createElement = (tagName, props, ...children) => {
    if (typeof tagName === 'string') {
        const tag = el[tagName]
        const effects = []
        for (const prop of Object.keys(props ?? {})) {
            if (prop.startsWith("on-")) {
                const eventName = prop.substring(3)
                effects.push(on[eventName](props[prop]))
            } else {
                effects.push(att[prop](props[prop]))
            }
        }
        effects.push(...children)
        return tag(...effects)
    } else {
        return tagName(props, ...children)
    }
}

const Fragment = (_, ...children) => {
    return children
}

export default {
    createElement,
    Fragment,
}