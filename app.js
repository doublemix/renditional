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

function main () {
    render(document.getElementById("app"), App())
}