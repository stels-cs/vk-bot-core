const {Core} = require("vk-bot-core")

const core = new Core("46ac4aaa77d6b3ebd8f851b45697a2250c7312e161b5169bc2f9ea9a7e8b426edf994015c063ef9ed3dd1")

core.onMessage("привет алиса", "Я не Алиса!")
core.onMessage(`Привет {first_name}, это самый простой бот, напиши мне "привет алиса"`)

core.startAsLongPoll()