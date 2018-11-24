# Bot core

Библиотека для ботов ВКонтакте на NodeJS
Для получения сообщений бот использует Long Poll https://vk.com/dev/bots_longpoll

```bash
npm i vk-bot-core
```

Убедитесть что у вас установлена nodejs версии 8 или выше

Пример:

```js
const {Core} = require('vk-bot-core')

const vk_token = "dfbf7f2edd9....cf24858f9a00" //Токен сообщества с правами на сообщения и управление

const core = new Core(vk_token)

core.on("message_new", msg => `Привет ${msg.GetUser().first_name}, чего хотел?`)

core.start()
```

Разные ответы на разные команды

```js
const {Core} = require('vk-bot-core')
const vk_token = "dfbf7f2edd9....cf24858f9a00" //Токен сообщества с правами на сообщения и управление

const core = new Core(vk_token)

core.on("message_new", msg => msg.HasText("инфо"), () => `Бот создан с помошью этой штуки https://github.com/stels-cs/vk-bot-core`)

core.on("message_new", msg => `Привет ${msg.GetUser().first_name}, чего хотел?`)

core.start()
```
### API

**core.on(event_name, callback)**
**core.on(event_name, filter, callback)**

* event_name – string тип события, полный типов событий можно посмотреть тут https://vk.com/dev/groups_events
* callback - function(CallbackEvent) return string|object обработчик события, принимает CallbackEvent и возвращает строку или объект с параметрами для метода https://vk.com/dev/messages.send. Можно ничего не возвращать в этом случае пользователю ничего не будет отправленно
* filter – function(CallbackEvent) return bool фильтр событий, если функция вернет true то будет вызван callback, иначе будут проверены другие обработчики этого типа события 

Обратите внимание что важен порядок объявления обработчиков событий одного типа

```js
core.on("message_new", msg => msg.HasText("инфо"), () => `kek`) //1
core.on("message_new", msg => msg.HasText("инфо"), () => `pek`) //2 никогда не выполняется

core.on("message_new", () => `pek`) //3
```

В данном случае второй обработчик никогда не будет вызван так как даже если мы пришлем сообщение с текстом "инфо" сработет фильтр у первого обрабочика и дальше обход обрабочиков не пойдет

```js
core.on("message_new", () => `pek`) //1

core.on("message_new", msg => msg.HasText("инфо"), () => `kek`) //2 никогда не выполняется
core.on("message_new", msg => msg.HasText("инфо"), () => `pek`) //3 никогда не выполняется
```

в этом случа 2 и 3 обработчик вообще никогда не будут вызваны потому что 1 обработчик не имеет фильтра, а значит получает все сообщения.

**CallbackEvent**

Объект с данными события, посомтреть формат объекта можно в документации (последний столбец) https://vk.com/dev/groups_events
У него есть несколько вспомогательных методов:

* HasText(string|array) bool - для типов событий message_new,message_reply,message_edit вернет true если указанная строка есть в сообщении
* GetUser() object – данные пользователя от которого пришло событие, объект вида
```json
{ 
  "member": 1, //1 - вступил в текущее сообщество 0 - не вступил
  "id": 19039187,
  "first_name": "Иван",
  "last_name": "Недзвецкий",
  "sex": 2,
  "city": { "id": 2, "title": "Санкт-Петербург" },
  "country": { "id": 1, "title": "Россия" },
  "photo_200": "https://pp.userapi.com/c824602/v824602919/10b152/waP9cXWfHwU.jpg?ava=1"
}
```

* IsChat() bool – для типов событий message_new,message_reply,message_edit вернет true если сообщение из группового чата
* IsDirect() bool – для типов событий message_new,message_reply,message_edit вернет true если сообщение в личку сообщества (не групповой чат)
* HasMention() bool – для типов событий message_new,message_reply,message_edit вернет true если в сообщении упоменули бота. Актуально если бот получает все сообщения из беседы и надо сделать команду на @botname команда
* IsFirstMessage() bool – для типов событий message_new,message_reply,message_edit вернет true если это "первое" сообщение. Тоесть если пользователь долго не писал боту (по умолчанию час, настраивается в core.sessionTime = 1000 * 60 * 60 (миллисекунд))
* IsFirstTyping() bool – для типов событий вернет true если пользователь первый раз печатает за последний час (по умолчанию час, настраивается в core.sessionTime = 1000 * 60 * 60 (миллисекунд))
* HasAttach(type) bool – проверяет наличие прикремений указанного типа в сообщении
* HasPhoto() bool – проверяет если ли хотябы одна фотография в сообщении
* GetPhotoMaxSizeUrl() string|null – возвращает ссылку на первую фотографию в сообщении
* Button() string|null – вернет кнопку если такая была нажата

### Keyboard (клавиатура)

Пример

```js
const {Core, Keyboard, DefaultBtn, NegativeBtn, PositiveBtn, PrimaryBtn} = require('vk-bot-core')
const vk_token = "dfbf7f2edd9f481c3a2302bf5b4595067eb4eab1cdff5851802a4216e2b5e26c2cb2a2117cf24858f9a00"

const core = new Core(vk_token)

const MainKeyboard = [
	[ DefaultBtn("Новости") ],
	[ NegativeBtn("Топ подписчиков") ],
	[ PositiveBtn("Red Bull", "bull") ],
	[ PrimaryBtn("Сделай вид типа печатаешь", "typing") ]
]

core.on("message_new", msg => msg.HasText("Новости"), () => "Сегодня ничего не произошло")
core.on("message_new", msg => msg.HasText("Топ подписчиков"), msg => `1 место ${msg.GetUser().first_name} vk.com/id${msg.GetUser().id}`)
core.on("message_new", msg => msg.Button() === "bull", () => `Muuuuuuuuuuuuuu!`)
core.on("message_new", msg => msg.Button() === "typing", async msg => {
	await core.api.call("messages.setActivity", {type:"typing", peer_id:msg.peer_id})
})


core.on("message_new", msg => {
	if (msg.IsFirstMessage()) {
		return Keyboard("Привет", MainKeyboard)
	} else {
		return Keyboard("Я просто бот, вот меню", MainKeyboard)
	}
})

core.start()
```

**Keyboard(text, buttons[, one_time])**
* text - string тескст сообщения (клавиатуру нельзя отправить без текста или аттачей)
* buttons - array of array of button массив с кнопками
* one_time - bool если true то клавиатура сразу пропадет после того как ползователь нажмет на кнопку, по умолчанию false

**DefaultBtn(text[, payload]), NegativeBtn, PositiveBtn, PrimaryBtn**
* text - string текст на кнопке
* payload - string|object

Эти 4 метода возвращают объект кнопки разных цветов

### Дополнительные запросы к api

Пример вызова методов api вконтакте внутри обработчика события
в даннам примере мы просто помечаем сообщение прочитанным и ничего не делаем

```js
const {Core} = require('vk-bot-core')
const vk_token = "dfbf7f2edd9f................b2a2117cf24858f9a00"

const core = new Core(vk_token)

core.on("message_new", async msg => {
  await core.api.call("messages.markAsRead", {peer_id: msg.peer_id})
})

core.start()
```

# Основлные ошибки

При запуске бота 

```bash
BOT FAILED: No token passed
Error: No token passed
....
```

Не передан, или передан пустой API ключ, проверьте строку где написано что-то такое const core = new Core(vk_token)

```bash
Error: VkApiError: groups.getById #5 User authorization failed: invalid access_token (4). 
```

Передан неверный API ключ, надо получить новый в настройках сообщества

```bash
BOT FAILED: VkApiError: groups.getById #27 Group authorization failed: group revoke access for this token. 
Error: VkApiError: groups.getById #27 Group authorization failed: group revoke access for this token. 
```
API ключ удалили из сообщества, надо получить новый в настройках сообщества

**Во время работы бота**

```bash
Error: VkApiError: messages.send #912 This is a chat bot feature, change this status in settings 
```
Не включены возможности бота в Управлении сообществом - Сообщения - Настройки для бота
