# Bot core

```bash
npm i vk-bot-core
```

Пример самого простого бота

```js
const {Core} = require('vk-bot-core')

const vk_token = "asdadasdasDFADFSDfasdfasfdASfASD" //Токен сообщества с правами на сообщения и управленик

const core = new Core(vk_token)

core.on("message_new", msg => `Привет ${msg.GetUser().first_name}, чего хотел?`)

core.start()
```