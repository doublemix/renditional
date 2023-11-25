const express = require('express')

const app = express()

const PORT = process.env.PORT || 3000

app.use(express.static('public'))
app.use('/renditional', express.static('../'))

app.listen(PORT, () => {
    console.log('listening on port ' + PORT)
})