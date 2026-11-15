# Где это? (geoguesser)

Клон GeoGuessr для двоих на одном телефоне. Бесплатно, без ключей и серверов.

- Фото берутся из геотегнутых снимков Wikimedia Commons по всему миру
- Карта: Leaflet + OpenStreetMap
- Очки как в GeoGuessr: `5000 * exp(-км / 1492.7)`
- 3 / 5 / 8 / 10 раундов, режим для двух игроков по очереди или соло
- PWA: на iPhone «Поделиться → На экран Домой»

Запуск локально: `python3 -m http.server` и открыть http://localhost:8000

## Режим Street View

Нужен ключ Google Maps Platform (Maps JavaScript API включён, привязана карта).
Ключ вводится в приложении и хранится в localStorage телефона, в репозиторий не попадает.
Бесплатно 5 000 загрузок Dynamic Street View в месяц. Ограничь ключ по HTTP-реферреру
`https://maxambrosiigmail.github.io/*` и поставь бюджет-алерт в Google Cloud.
