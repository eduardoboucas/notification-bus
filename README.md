# 🚌 Notification Bus

A Node.js library for loading and rendering notifications from a remote API.

## Installation

To install `notification-bus` in your project, run:

```
npm install notification-bus
```

The API is distributed as a Netlify Function, although you should be able to change the implementation to fit any serverless function provider with support for Node.js.

For a one-click deploy to Netlify, use the button below.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/eduardoboucas/notification-bus)

## Usage

### Client

To use `notification-bus`, you first need to create an instance of the library and set the API endpoint for loading notifications.

```ts
import { NotificationBus } from "notification-bus"

const bus = new NotificationBus({
  name: "my-awesome-cli",
  version: "1.0.0",
  url: "https://notification-bus.netlify.app"
})
```

Once you have an instance, you can show all notifications relevant to your application using the `render` function.

```ts
bus.render()
```

This uses the default renderer to show notifications using the format below.

<img width="465" alt="Screenshot 2023-02-07 at 00 01 31" src="https://user-images.githubusercontent.com/4162329/217114299-43267757-65a1-4f51-860f-bd661c0efbf5.png">


If you want to use your own renderer, you can supply a `renderer` property.

```ts
bus.render({
  renderer: (items) => {
    console.log('Notifications:', items)
  }
})
```

You can also get direct access to the notification objects and process them in any way you like, using the `getItems` function.

```ts
const items = await bus.getItems()

console.log(items)
```

### Server

To create new notifications, edit the `data/events.json` file and add entries to the array. Each entry can have the following properties:

- `body` (required): The body text of the notification
- `title` (optional): The title of the notification
- `severity` (optional): A severity level for the notification (1: critical, 2: warning, 3: information), which will influence the way the notification is rendered
- `display_interval` (optional): If set, defines the minimum interval at which a notification can be shown; for example, if set to `"30 min"`, that notification will be shown at most once every 30 minutes
- `inputs` (optional): A list of inputs that should be sent in the `render`/`getItems` call for the notification to match (see [Inputs](#inputs))
- `min_app_version` (optional): The minimum version of the app required for the notification to match
- `max_app_version` (optional): The maximum version of the app required for the notification to match
- `min_node_version` (optional): The minimum version of Node.js required for the notification to match
- `max_node_version` (optional): The maximum version of Node.js required for the notification to match
- `arch` (optional): A list of CPU types (in the format of `process.arch`) required for the notification to match
- `platform` (optional): A list of operating systems (in the format of `process.platform`) required for the notification to match

For more information about each property, see their [type definition](lib/api.ts).

## Configuration options

The `NotificationBus` constructor accepts an options object with the following properties:

- `url` (required): The base URL of the API endpoint for loading notifications
- `name` (required): The name of the application consuming the notifications
- `version` (required): The version of the application consuming the notifications (must follow [semver](https://semver.org/))
- `cachePath` (optional, default: OS-specific location): The path to the local file where notification data will be cached
- `fetchInterval` (optional, default: 30 minutes): How often to poll the remote API for new notifications (value in milliseconds)
- `renderer` (optional, default: built-in renderer): Custom function to display notifications in the terminal

## Inputs

Both the `getItems` and the `render` functions accept an optional `inputs` option. This is a great way to display messages only when certain events happen in your application (e.g. when a specific command of your CLI is used).

If an event has an `inputs` array defined, it will be discarded if the `getItems`/`render` call doesn't have an `inputs` value with at least one matching entry.

For example, imagine the following event:

```json
{
  "title": "Deprecated API",
  "body": "The version of the `foobar` API you're using has been deprecated and will stop working with the next release.\n\nPlease visit https://example.com for more information.",
  "inputs": ["command:one", "command:three"]
}
```

And the following `render` calls:

```ts
// The event will not be rendered
bus.render({
  inputs: new Set("command:two")
})

// The event will be rendered
bus.render({
  inputs: new Set("command:one")
})
```

