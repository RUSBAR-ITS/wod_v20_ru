# World of Darkness 20th — Russian Localization

Fan-made Russian translation module for the **World of Darkness 20th edition** system (`worldofdarkness`) for Foundry VTT.

> This project is not affiliated with or endorsed by Paradox Interactive AB.  
> World of Darkness and related trademarks are the property of Paradox Interactive AB.  
> This is a non-commercial fan translation for tabletop use.

---

## Features

- Adds **Russian language** support for the `worldofdarkness` system.
- Uses the same localization keys as the original system, so it:
  - Translates sheets, dialogs, and system-specific UI;
  - Can be enabled/disabled as a regular Foundry module without touching the base system.

The module ID is:

```text
wod_v20_ru
```

---

## Requirements

- **Foundry VTT**: 13.x  
- **System**: [World of Darkness 20th edition](https://github.com/JohanFalt/Foundry_WoD20) (`worldofdarkness`)

---

## Installation

### Option 1 – Manifest URL (recommended once published)

In Foundry’s **Add-on Modules → Install Module** dialog, paste the manifest URL:

```text
https://raw.githubusercontent.com/RUSBAR-ITS/wod_v20_ru/main/module.json
```

Then click **Install**.

> Note: if you change the branch/tag or use releases, update this URL accordingly.

### Option 2 – Manual installation

1. Download or clone this repository:
   ```bash
   git clone https://github.com/RUSBAR-ITS/wod_v20_ru.git
   ```
2. Copy or symlink the folder so that it ends up as:
   ```text
   {userData}/Data/modules/wod_v20_ru
   ```
   For example on Linux:
   ```text
   /home/USERNAME/foundrydata/Data/modules/wod_v20_ru
   ```
3. Restart Foundry VTT.

---

## Usage

1. Start (or create) a world that uses the `worldofdarkness` system.
2. Go to **Game Settings → Manage Modules** and enable:
   - **World of Darkness 20th — Russian Localization** (`wod_v20_ru`)
3. Go to **Configure Settings → Language** and select **Russian**.
4. Reload the world. System UI elements provided by `worldofdarkness` will use the Russian strings where available.

If some parts of the UI remain in English, it means the corresponding keys have not been translated yet and will fall back to the system’s original language.

---

## Translation status

The translation is a work in progress.

- [ ] Core character sheet terminology
- [ ] Actor types and templates
- [ ] Item types, powers, merits/flaws
- [ ] Chat messages and roll tooltips
- [ ] System settings and dialogs

You can always use the module even in a partially translated state.

---

## Contributing

Contributions are welcome:

- Report missing or incorrect translations via **GitHub Issues**.
- Submit Pull Requests with improvements to `lang/ru.json`.

When editing localization files, please:

- Keep all JSON keys **identical** to those in the original system (`lang/en.json`).
- Avoid adding copyrighted rules text beyond what is required for UI labels.

---

## Credits & Legal

- Original Foundry VTT system: [World of Darkness 20th edition](https://github.com/JohanFalt/Foundry_WoD20) by **Johan Fält**.
- Russian translation module: **RUSBAR**.

All World of Darkness–related IP belongs to **Paradox Interactive AB**.  
This project is non-commercial and intended solely for tabletop play with legally owned books.

For license details of this repository, see the [`LICENSE`](./LICENSE) file.



# Мир Тьмы V20 — Русификация

Фанатский модуль русской локализации для системы **World of Darkness 20th edition** (`worldofdarkness`) в Foundry VTT.

> Проект не аффилирован и не одобрен Paradox Interactive AB.  
> World of Darkness и связанные обозначения являются товарными знаками Paradox Interactive AB.  
> Это некоммерческий фанатский перевод для настольной игры.

---

## Возможности

- Добавляет поддержку **русского языка** для системы `worldofdarkness`.
- Использует те же ключи локализации, что и оригинальная система, поэтому:
  - Переводит листы персонажей, окна и системный интерфейс;
  - Включается и выключается как обычный модуль Foundry, не изменяя базовую систему.

ID модуля:

```text
wod_v20_ru
```

---

## Требования

- **Foundry VTT**: 13.x  
- **Система**: [World of Darkness 20th edition](https://github.com/JohanFalt/Foundry_WoD20) (`worldofdarkness`)

---

## Установка

### Вариант 1 — через Manifest URL

В лаунчере Foundry в окне **Add-on Modules → Install Module** вставьте URL манифеста:

```text
https://raw.githubusercontent.com/RUSBAR-ITS/wod_v20_ru/main/module.json
```

Затем нажмите **Install**.

> Если позже изменится ветка/тег или будут использоваться релизы, URL манифеста нужно будет обновить.

### Вариант 2 — ручная установка

1. Скачайте или клонируйте репозиторий:
   ```bash
   git clone https://github.com/RUSBAR-ITS/wod_v20_ru.git
   ```
2. Скопируйте (или сделайте symlink) папку так, чтобы она оказалась по пути:
   ```text
   {userData}/Data/modules/wod_v20_ru
   ```
   Например, на Linux:
   ```text
   /home/ИМЯ_ПОЛЬЗОВАТЕЛЯ/foundrydata/Data/modules/wod_v20_ru
   ```
3. Перезапустите Foundry VTT.

---

## Использование

1. Запустите (или создайте) мир, который использует систему `worldofdarkness`.
2. Откройте **Game Settings → Manage Modules** и включите модуль:
   - **World of Darkness 20th — Русская локализация** (`wod_v20_ru`)
3. Зайдите в **Configure Settings → Language** и выберите **Russian**.
4. Перезагрузите мир. Элементы интерфейса системы `worldofdarkness` будут использовать русские строки там, где они переведены.

Если какие-то элементы остаются на английском — значит соответствующие ключи пока не переведены и падают в язык системы по умолчанию.

---

## Статус перевода

Перевод находится в активной разработке.

Планируемые области:

- [ ] Базовая терминология листа персонажа
- [ ] Типы акторов и шаблоны
- [ ] Типы предметов, дисциплины/дары/способности
- [ ] Сообщения чата и подсказки бросков
- [ ] Системные настройки и диалоги

Модуль можно использовать и в частично переведённом состоянии.

---

## Участие и правки

Мы рады PR’ам и отчётам об ошибках:

- Сообщайте о проблемах и неточностях через **Issues** в GitHub.
- Отправляйте Pull Request’ы с правками в `lang/ru.json`.

Пожалуйста:

- Не меняйте имена ключей JSON — они должны совпадать с ключами из `lang/en.json` системы.
- Не добавляйте правила и большие фрагменты оригинальных текстов — только UI-строки и короткие подписи.

---

## Авторы и правовой статус

- Оригинальная система Foundry: [World of Darkness 20th edition](https://github.com/JohanFalt/Foundry_WoD20), автор **Johan Fält**.
- Модуль русской локализации: **RUSBAR** и участники проекта.

Все права на материалы World of Darkness принадлежат **Paradox Interactive AB**.  
Проект некоммерческий и предназначен исключительно для игры за столом при наличии легально приобретённых книг.

Подробнее о лицензии репозитория см. файл [`LICENSE`](./LICENSE).
