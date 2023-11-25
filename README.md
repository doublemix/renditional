# `renditional`

Renditional is a JavaScript library for creating user interfaces.

Renditional focuses on pushing updates as deep in the templates as possible. If a piece of text changes based on some reactive state, then only that text will be re-rendered when the state changes.

Updates in Renditional are driven by automatically-tracked dependencies. See the specific APIs for what supports automatic tracking. When a tracked dependency updates, it may trigger some update in the UI.

## Usage

```javascript
import { render, el, ref } from 'renditional';

function Counter () {
    const count = ref(0);

    return [
        el.h1(
            text(() => count.current.toString()),
        ),
        el.button(
            on.click(() => count.current += 1)
            "Increment",
        ),
    ]
}

render(document.getElementById("root"))
```

## Documentation and API

Coming soon...

