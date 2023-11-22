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

class Dependency {
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

class Dependent {
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

const ref = initialValue => {
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
        refresh () {
            dep.updated();
        }
    }
}

const watch = callback => {
    const dependent = new Dependent(() => { run() });

    function run () {
        dependent.clearDependencies();
        Deps.with(dependent, () => {
            callback()
        })
    }

    run()

    return () => dependent.cancel()
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
}

const makeDestroyer = () => {
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

const maybe = (calculateShown, construct) => {
    return (root, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        const comment = document.createComment("")
        root.appendChild(comment)
        destroy(() => root.removeChild(comment))

        const section = new Section(comment)

        let currentShown
        Deps.with(dependent, () => {
            currentShown = maybeCall(calculateShown)
        })

        let currentDestroyer = null

        if (currentShown) {
            currentDestroyer = makeDestroyer()
            render(root, maybeCall(construct), currentDestroyer.destroy)
        }

        dependent.registerCallback(() => {
            let nextShown

            Deps.with(dependent, () => {
                nextShown = maybeCall(calculateShown)
            })

            if (nextShown && !currentShown) {
                currentDestroyer = makeDestroyer()
                render(root, maybeCall(construct), currentDestroyer.destroy)
            }

            if (!nextShown && currentShown) {
                currentDestroyer()
                currentDestroyer = null
            }
            
            currentShown = nextShown
        })

        destroy(() => currentDestroyer?.())
    }
}

const map = (calculateIterable, mapper) => {
    return (root, destroy) => {
        const dependent = new Dependent(run)
        destroy(() => dependent.cancel())

        const comment = document.createComment("map")
        root.appendChild(comment)
        destroy(() => root.removeChild(comment))
        
        let iterableValue
        let destroyer = null

        destroy(() => { destroyer?.() })
        
        function run () {
            destroyer?.()

            Deps.with(dependent, () => {
                iterableValue = maybeCall(calculateIterable)
            })

            let destroyCallbacks = []

            function destroy (callback) {
                destroyCallbacks.unshift(callback)
            }
            
            for (const value of iterableValue) {
                render(new Section(comment), mapper(value), destroy)
            }

            function newDestroyer () {
                destroyCallbacks.forEach(cb => cb())
            }

            destroyer = newDestroyer
        }
        
        run()
    }
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

const el = createPropertyBasedProxy(tagName => {
    function self(...children) {
        return (root, destroy) => {
            const element = document.createElement(tagName)

            root.appendChild(element)

            destroy(() => root.removeChild(element))

            render(element, children, destroy)
        }
    }

    return self
})

const __testEl = document.createElement('div')

const att = createPropertyBasedProxy(attributeName => {
    function self(calculateValue) {
        return (root, destroy) => {
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
        }
    }

    return self
})

const on = createPropertyBasedProxy(eventName => {
    function self(listener) {
        return (root, destroy) => {
            root.addEventListener(eventName, listener)

            destroy(() => root.removeEventListener(eventName, listener))
        }
    }

    return self
})

const text = (valueCreator) => {
    return (root, destroy) => {
        const textNode = document.createTextNode('')

        const cancel = watch(() => {
            textNode.textContent = maybeCall(valueCreator)
        })

        destroy(cancel)

        root.appendChild(textNode)

        destroy(() => root.removeChild(textNode))
    }
}

const managedInputValue = (valueCreator) => {
    return (root, destroy) => {
        const dep = new Dependent(run)
        destroy(() => dep.cancel())

        function run () {
            let value

            Deps.with(dep, () => {
                value = maybeCall(valueCreator)
            })

            root.value = value
        }

        run()

    }
}

const maybeCall = (valueOrFn, ...args) => {
    if (typeof valueOrFn === 'function') {
        return valueOrFn(...args)
    }
    return valueOrFn
}

const noop = () => {}

const render = (root, template, destroy = noop) => {
    if (template instanceof Array) {
        for (const item of template)
            render(root, item, destroy)
    }
    else if (typeof template === 'function') {
        template(root, destroy)
    } else if (template === null || typeof template === 'string' || typeof template === 'number' || typeof template === 'boolean') {
        const textNode = document.createTextNode(template)
        root.appendChild(textNode)
        destroy(() => root.removeChild(textNode))
    } else {
        root.appendChild(template)
        destroy(() => root.removeChild(template))
    }
}