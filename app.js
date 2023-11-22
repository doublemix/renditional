function TodoApp()
{
    const inputValue = ref('')
    const todos = ref([])

    const submitTodo = (event) => {
        event.preventDefault()

        const todo = {
            description: ref(inputValue.current),
            isComplete: ref(false),
        }

        todos.current.push(todo)
        todos.refresh()
        inputValue.current = ''

        return false
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
        el.ul(
            map(() => todos.current,
            (todo) => {
                return Todo({ todo })
            }),
            el.li("this is probably wrong")
        )
    )
}

function Todo({ todo }) {
    return [el.li(
        on.click(() => todo.isComplete.current = !todo.isComplete.current),
        text(() => `${todo.description.current} (${todo.isComplete.current ? 'Done' : 'Waiting' })`),
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
                " Buzz!")
        ),
        el.div(
            el.button(
                on.click(() => counter.current++),
                text("Click me!")
            )
        ),
        TodoApp(),
    ]
}

function main () {
    render(document.getElementById("app"), App())
}