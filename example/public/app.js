import {
    StandardEffect,
    Dependent,
    render,
    el,
    att,
    on,
    maybe,
    map,
    text,
    ref,
    createEffect,
    computed,
    component,
    useEffect,
    reactive,
} from "/renditional/core.js"

function maybeCall (maybeFn, ...args) {
    if (typeof maybeFn === 'function') {
        return maybeFn(...args)
    }
    return maybeFn
}

const managedInputValue = (valueCreator) => {
    return new StandardEffect((root, destroy) => {
        const dependent = new Dependent()
        destroy(() => dependent.cancel())

        dependent.onDependencyUpdated(run)
        
        run()

        function run () {
            const value = dependent.with(() => {
                return maybeCall(valueCreator)
            })

            root.value = value
        }
    })
}

const nextId = (() => {
    let currentId = 0
    return () => currentId++
})()

function TodoApp()
{
    const inputValue = ref('')
    const todos = ref([])

    const submitTodo = (event) => {
        event.preventDefault()

        const todo = {
            id: nextId(),
            description: ref(inputValue.current),
            isComplete: ref(false),
        }

        todos.current.push(todo)
        todos.refresh()
        inputValue.current = ''

        return false
    }

    const shuffleTodos = () => {
        const working = todos.current

        // take random actions
        let i = 0
        while (i < 10) {
            i++

            const canSwap = working.length > 1
            const canDelete = working.length > 0

            const options = ['create', canSwap && 'swap', canDelete && 'delete'].filter(x => typeof x === 'string')

            const operation = options[Math.floor(Math.random() * options.length)]

            if (operation === 'create') {
                const newTodo = {
                    id: nextId(),
                    description: ref([..."asdfasdf"].map(x => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join('')),
                    isComplete: ref(Math.random() > 0.5),
                }

                const index = Math.floor(Math.random() * working.length + 1)
                
                working.splice(index, 0, newTodo)
            }

            if (operation === 'swap') {
                let i = Math.floor(Math.random() * working.length)
                let j = Math.floor(Math.random() * working.length)

                const temp = working[i]
                working[i] = working[j]
                working[j] = temp
            }

            if (operation === 'delete') {
                let i = Math.floor(Math.random() * working.length)

                working.splice(i, 1)
            }
        }

        todos.refresh()
        window.todos = working
    }

    return el.div(
        el.form(
            on.submit(submitTodo),
            el.input(
                managedInputValue(() => inputValue.current),
                on.input((event) => { inputValue.current = event.target.value })
            ),
            el.button(
                att.type("submit"),
                att.disabled(() => inputValue.current.trim() == ''),
                text("New Todo")
            )
        ),
        el.div(
            el.button(
                on.click(shuffleTodos),
                "Shuffle Todos",
            ),
            " ",
            text(() => JSON.stringify(todos.current.map(x => x.id))),
        ),
        el.ul(
            map(() => todos.current,
            (todo) => {
                const deleteTodo = () => {
                    const index = todos.current.indexOf(todo)
                    todos.current.splice(index, 1)
                    todos.refresh()
                }
                return Todo(todo, deleteTodo)
            }),
            el.li("Extra: not a todo")
        )
    )
}

function Todo(todo, deleteSelf) {
    return [el.li(
        on.click(() => todo.isComplete.current = !todo.isComplete.current),
        text(() => `#${todo.id}:`),
        " ",
        text(() => `${todo.description.current} (${todo.isComplete.current ? 'Done' : 'Waiting' })`),
        " ",
        el.button(
            on.click(deleteSelf),
            "Delete"
        ),
        " ",
        InitialRenderDetector(),
    )]
}

function App () {
    const counter = ref(0)

    return [
        el.div(
            att.class("test"),
            text(() => `Counter: ${counter.current}`),
            maybe(() => counter.current > 0 && counter.current % 3 === 0,
                () => text(" Fizz!")),
            maybe(() => counter.current > 0 && counter.current % 5 === 0,
                " Buzz!"),
        ),
        el.div(
            el.button(
                on.click(() => counter.current++),
                text("Click me!")
            )
        ),
        TodoApp(),
        TestDependenciesApp(),
        TestMaybeApp(),
        TestMapInMaybeApp(),
        TestWebComponentsAndDataAttributes(),
        TestComputed(),
        TestComponent(),
        TestComponentEffects(),
        TestReactiveApp(),
    ]
}

function InitialRenderDetector () {
    return [
        el.span(
            att.class("render-detector"),
            createEffect((root) => {
                root.animate([
                    { color: 'lightgreen' },
                    { offset: 0.25, color: 'lightgreen'},
                    { offset: 0.75, color: 'black' },
                    { offset: 0.99, color: 'transparent', display: 'inline' },
                    { display: 'none' }
                ], {
                    duration: 2000,
                    fill: 'forwards',
                })
            }),
            "Render!"
        ),
    ]
}

function TestMaybeApp () {
    const shownA = ref(true)
    const shownB = ref(true)
    const shownC = ref(true)

    const toggleA = () => {
        shownA.current = !shownA.current
    }

    const toggleB = () => {
        shownB.current = !shownB.current
    }

    const toggleC = () => {
        shownC.current = !shownC.current
    }

    return [
        el.h1("Test Maybe"),
        el.div(
            el.button("Toggle A", on.click(() => toggleA())),
            el.button("Toggle B", on.click(() => toggleB())),
            el.button("Toggle C", on.click(() => toggleC())),
        ),
        el.div(
            maybe(() => shownA.current, el.div("Item A")),
            maybe(() => shownB.current, el.div("Item B")),
            maybe(() => shownC.current, el.div("Item C")),
        ),
    ]
}

function TestDependenciesApp () {
    const shown = ref(false)

    const value = ref(0)
    const logs = ref([])

    const log = (value) => {
        logs.value.push({ value })
        setTimeout(() => logs.refresh(), 0)
    }

    const toggleShown = () => {
        shown.current = !shown.current
    }

    const increment = () => {
        value.current++
    }

    return [
        el.h1("Test Dependencies"),
        el.div(
            el.button(
                on.click(() => toggleShown()),
                "Shown: ",
                text(() => shown.current.toString()),
            ),
            el.button(
                on.click(() => increment()),
                "Value: ",
                text(() => value.current.toString()),
            ),
        ),
        maybe(() => {
            log(`updating text: ${shown.value ? "shown" : "hidden"} ${value.value}`)
            if (shown.current) {
                return value.current < 0
            }
            return false
        }, () => "You can't see me"),
        el.pre(
            map(() => logs.current,
            x => `> ${x.value}\n`)
        )
    ]
}

function TestMapInMaybeApp ()
{
    const items = ref([{ x: 1 }, { x: 2 }, { x: 3 }])
    const shown = ref(false)
    const toggleShown = () => {
        shown.current = !shown.current
    }

    const swap = () => {
        const working = items.current
        const temp = working[0]
        working[0] = working[1]
        working[1] = temp
        items.refresh()
    }

    return [
        el.h1("Test Map In Maybe"),
        el.div(
            el.button(
                on.click(() => toggleShown()),
                "Shown: ",
                text(() => shown.current.toString()),
            ),
            el.button(
                on.click(() => swap()),
                "Swap",
            ),
        ),
        el.div(
            maybe(
                () => shown.current,
                map(
                    () => items.current,
                    (item) => el.div(text(item.x)),
                ),
            ),
        ),
    ]
}

class HelloWorldComponent extends HTMLElement {
    connectedCallback() { // callback method
        this.innerHTML = 'Hello, World!'
    }
}

// Define the custom element
window.customElements.define('hello-world', HelloWorldComponent)

function TestWebComponentsAndDataAttributes () {
    return [
        el.h1("Test Web Components and Data Attributes"),
        el.div("In other words, test camelCase to kebab-case"),
        el.helloWorld(),
        el.div(
            att.dataText("Test data attribute"),
            createEffect((node) => {
                node.textContent = node.dataset.text
            }),
        ),
    ]
}

function TestComputed () {
    const a = ref(0)
    const b = ref(0)
    let lastSet = "a"

    const c = computed(
        () => a.current + b.current,
        (value) => {
            if (lastSet === 'a') {
                b.current = value - a.current
            } else {
                a.current = value - b.current
            }
        }
    )

    return [
        el.h1("Test Computed"),
        el.div(
            el.input(
                att.type("number"),
                managedInputValue(() => a.current),
                on.change(event => { lastSet = "a", a.current = +event.target.value }),
            ),
            " + ",
            el.input(
                att.type("number"),
                managedInputValue(() => b.current),
                on.change(event => { lastSet = "b", b.current = +event.target.value }),
            ),
            " = ",
            el.input(
                att.type("number"),
                managedInputValue(() => c.current),
                on.change(event => { c.current = +event.target.value }),
            ),
        )
    ]
}

function TestComponent () {
    const CounterWithout = () => {
        const counter = ref(0)

        return [
            el.button(
                att.type("button"),
                on.click(() => counter.current++),
                text(() => `Clicks: ${counter.current}`)
            )
        ]
    }
    const CounterWith = () => component(CounterWithout)

    const counterWithoutTemplate = CounterWithout()
    const counterWithTemplate = CounterWith()

    const maybeWithoutTemplate = CounterWithout()
    const maybeWithTemplate = CounterWith()

    const Maybe = (child) => {
        const isShown = ref(true)
        return [
            el.div(
                el.button(
                    att.type("button"),
                    on.click(() => { isShown.current = !isShown.current }),
                    "Toggle",
                )
            ),
            maybe(
                () => isShown.current,
                child,
            )
        ]
    }

    return [
        el.h1("Test Component"),
        el.h2("Counter With-out"),
        counterWithoutTemplate,
        counterWithoutTemplate,
        el.h2("Counter With"),
        counterWithTemplate,
        counterWithTemplate,
        el.h2("Maybe With-out"),
        Maybe(maybeWithoutTemplate),
        el.h2("Maybe With"),
        Maybe(maybeWithTemplate),
    ]
}

function TestComponentEffects () {
    const Updater = (global, deleteInst, intervalMethod) => component(() => {
        const intervalMs = ref(2000)

        useEffect((cleanUp) => {
            let lastTimeMs = Date.now()
            let cumulativeOffByMs = 0
            
            function coreUpdate () {
                global.current++
                elRef.current.animate([
                    { backgroundColor: 'limegreen' },
                    { backgroundColor: 'transparent' },
                ], {
                    duration: 500,
                    fill: 'forwards',
                })

                const thisTimeMs = Date.now()
                const diff = thisTimeMs - lastTimeMs
                const offBy = diff - intervalMs.value
                cumulativeOffByMs += offBy

                const message = `Update { expected: ${intervalMs.value}ms, actual: ${diff}ms, offBy: ${offBy} (total ${cumulativeOffByMs}ms) }`;

                if (cumulativeOffByMs < 0 || cumulativeOffByMs > 2000) {
                    console.error(message)
                } else if (offBy < 0) {
                    console.warn(message)
                } else {
                    console.log(message)
                }

                lastTimeMs = thisTimeMs
            }

            if (intervalMethod.current === 'setTimeout') {
                let timeoutId
                function helper () {
                    timeoutId = setTimeout(() => {
                        coreUpdate();
                        helper()
                    }, intervalMs.current)
                }
                helper()
                cleanUp(() => clearTimeout(timeoutId))
            } else if (intervalMethod.current === 'setInterval') {
                let intervalId = setInterval(() => {
                    coreUpdate()
                }, intervalMs.current)
                cleanUp(() => clearInterval(intervalId))
            }
        })

        const elRef = ref(null)

        return el.div(
            el.button(
                on.click(() => intervalMs.current -= 500),
                att.disabled(() => intervalMs.current <= 1000),
                "-"
            ),
            el.span(
                createEffect((node) => elRef.current = node),
                text(() => `Every ${intervalMs.current}ms`)
            ),
            el.button(
                on.click(() => intervalMs.current += 500),
                "+",
            ),
            el.button(
                on.click(() => deleteInst()),
                "Delete",
            )
        )
    })

    const instances = ref([])
    const globalCounter = ref(0)
    const intervalMethod = ref("setInterval")

    const makeOption = (value) => ({ value, label: value })

    const intervalOptions = [
        makeOption('setTimeout'),
        makeOption('setInterval'),
        makeOption('none'),
    ]

    const deleteInst = inst => {
        const index = instances.current.indexOf(inst)
        if (index >= 0) {
            instances.current.splice(index, 1)
            instances.refresh()
        }
    }

    return [
        el.h1("Test Component Effects"),
        el.div("Global: ", text(() => globalCounter.current)),
        el.select(
            on.input(event => intervalMethod.current = event.target.value),
            intervalOptions.map(({ value, label }) =>
                el.option(
                    att.value(value),
                    label,
                )
            ),
            createEffect(node => node.value = intervalMethod.value ),
        ),
        el.div(
            el.button(
                on.click(() => {
                    instances.current.push({})
                    instances.refresh()
                }),
                "Add"
            )
        ),
        map(
            () => instances.current,
            (inst) => Updater(globalCounter, () => deleteInst(inst), intervalMethod),
        ),
    ]
}

function TestReactiveApp () {
    const displayTemplate = ref("ul-list")

    const Counter = () => {
        const counter = ref(0)

        const increment = () => counter.current++

        return el.div(
            el.button(
                text(() => `Value: ${counter.current}`),
                on.click(() => increment())
            )
        )
    }

    return [
        el.div(
            el.select(
                el.option(att.value("red-text"), "Red Text"),
                el.option(att.value("ul-list"), "Bulleted List"),
                el.option(att.value("ol-list"), "Numbered List"),
                el.option(att.value("counter"), "Counter"),
                el.option(att.value(''), "???"),
                createEffect(node => node.value = displayTemplate.value),
                on.input(event => displayTemplate.current = event.target.value),
            ),
            reactive(() => displayTemplate.current),
            el.div(() => {
                if (displayTemplate.current === 'red-text') {
                    return el.div(att.style("color: red;"), "Some red text")
                }
                if (displayTemplate.current === "ul-list") {
                    return el.ul(
                        el.li("Some thing"),
                        el.li("Another thing"),
                    )
                }
                if (displayTemplate.current === 'ol-list') {
                    return el.ol(
                        el.li("First thing"),
                        el.li("Second thing"),
                    )
                }
                if (displayTemplate.current === 'counter') {
                    return Counter()
                }
                return "???"
            }),
        ),
    ]
}

function main () {
    render(document.getElementById("app"), App())
}

main()