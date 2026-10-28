declare namespace opensd {
  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
  type JsonObject = { [key: string]: Json };

  type Controller = "key" | "side";

  interface Device {
    id: string;
    name: string;
    connected: boolean;
    keys: { columns: number; rows: number; width: number; height: number };
    side: { slots: number; width: number; height: number };
  }

  interface TitleStyle {
    align?: "top" | "middle" | "bottom";
    /** Pixels, 6..32. */
    size?: number;
    /** `#rrggbb`. */
    color?: string;
    bold?: boolean;
  }

  /** Commands about one key. Commands for a key that has just disappeared are dropped. */
  interface Key {
    readonly context: string;
    readonly action: string;
    readonly controller: Controller;
    readonly position: { column: number; row: number };
    /** `null` restores the title from the manifest. */
    setTitle(title: string | null, style?: TitleStyle): Key;
    /**
     * A path inside the package, a `data:image/…;base64,` URI, or an http(s) URL allowed by
     * [permissions] loopback or network, up to 1 MiB; `null` restores the manifest image.
     */
    setImage(image: string | null): Key;
    setState(state: number): Key;
    flash(kind?: "ok" | "alert"): Key;
    saveSettings(settings: JsonObject): Key;
    /** Sends a message to this key's settings page, if it is open. */
    toInspector(payload: Json): Key;
  }

  interface KeyEvent<S extends JsonObject = JsonObject> {
    type: string;
    now: number;
    context: string;
    action: string;
    controller: Controller;
    position: { column: number; row: number };
    settings: S;
    state: number;
    /** `holdRepeat`: 1 for the first repeat. */
    count?: number;
    /** `holdEnd`: how long the key was held, ms. */
    duration?: number;
    /** `inspectorMessage`: what the settings page sent. */
    payload?: Json;
    key: Key;
  }

  interface Init {
    type: "init";
    now: number;
    plugin: { id: string; version: string };
    app: { version: string; os: string; language: string };
    device: Device | null;
    globals: JsonObject;
  }

  type KeyEventType =
    | "appear"
    | "disappear"
    | "keyDown"
    | "keyUp"
    | "tap"
    | "longPress"
    | "holdStart"
    | "holdRepeat"
    | "holdEnd"
    | "settings"
    | "inspectorOpen"
    | "inspectorClose"
    | "inspectorMessage";

  /** Handlers for one action; each gets the event of its type. */
  type ActionHandlers<S extends JsonObject = JsonObject> = {
    [T in KeyEventType]?: (event: KeyEvent<S>) => void | Promise<void>;
  };

  interface HttpRequest {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
    headers?: Record<string, string>;
    body?: string;
    /** Milliseconds, 100..30000, default 5000. */
    timeout?: number;
    /** The response body arrives base64-encoded, for images and other binary data. */
    binary?: boolean;
  }

  interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
  }

  interface Socket {
    send(text: string): void;
    close(): void;
    onopen: (() => void) | null;
    onmessage: ((data: string) => void) | null;
    onclose: ((reason: string) => void) | null;
  }

  interface AppStatus {
    installed: boolean;
    processes: { pid: number; args: string[] }[];
  }

  interface Navigation {
    profile: { id: string; name: string };
    /** Counting from 0. */
    page: number;
    pages: number;
  }
}

declare const opensd: {
  /** Registers handlers for one action id. */
  action<S extends opensd.JsonObject = opensd.JsonObject>(id: string, handlers: opensd.ActionHandlers<S>): void;
  /** Listens to any event type, for every action. */
  on(type: "init", fn: (event: opensd.Init) => void): void;
  on(type: opensd.KeyEventType, fn: (event: opensd.KeyEvent) => void): void;
  on(type: "globals", fn: (event: { settings: opensd.JsonObject }) => void): void;
  on(type: "device", fn: (event: { device: opensd.Device | null }) => void): void;
  on(type: "language", fn: (event: { language: string }) => void): void;
  on(type: "settingsPageOpen" | "settingsPageClose", fn: () => void): void;
  on(type: "settingsPageMessage", fn: (event: { payload: opensd.Json }) => void): void;
  /** After init and whenever the deck shows another profile or page. */
  on(type: "navigation", fn: (event: opensd.Navigation) => void): void;
  /** The computer woke up from sleep. */
  on(type: "systemWake", fn: () => void): void;
  on(type: string, fn: (event: any) => void): void;

  /** A visible key by context. */
  key(context: string): opensd.Key;
  /** Visible keys, optionally of one action. */
  keys(action?: string): opensd.Key[];

  readonly plugin: { id: string; version: string };
  readonly language: string;
  readonly device: opensd.Device | null;
  /** The profile and page shown on the deck. */
  readonly navigation: opensd.Navigation | null;
  /** Monotonic milliseconds since the plugin started. */
  now(): number;

  /** Plugin-wide settings. */
  readonly globals: opensd.JsonObject;
  setGlobals(settings: opensd.JsonObject): void;
  /** Sends a message to the plugin settings window, if it is open. */
  toSettingsPage(payload: opensd.Json): void;

  /** HTTP through the host: loopback needs [permissions] loopback, other URLs need [permissions] network. */
  http(url: string, request?: opensd.HttpRequest): Promise<opensd.HttpResponse>;
  /** WebSocket through the host, with the same rules as http. */
  ws(url: string): opensd.Socket;
  app: {
    status(app: string): Promise<opensd.AppStatus>;
    launch(app: string, args?: number[]): Promise<void>;
    quit(app: string): Promise<void>;
    /** Calls `fn` now and whenever the application starts or quits; returns a function that stops watching. */
    watch(app: string, fn: (status: opensd.AppStatus) => void): () => void;
  };
  clipboard(text: string): Promise<void>;
  /** Needs [permissions] keyboard. Combinations look like `"Ctrl + Shift + M"`. */
  keyboard: {
    press(keys: string): Promise<void>;
    /** Holds keys until `up`; the host releases them when the plugin stops. */
    down(keys: string): Promise<void>;
    up(keys: string): Promise<void>;
    type(text: string): Promise<void>;
  };
  /** Needs [permissions] navigation. Finds the profile by name or id; `page` counts from 0. */
  switchProfile(profile: string, page?: number): void;
  /** Needs [permissions] navigation. */
  switchPage(page: number): void;
  /** Opens an https:// link; works within 3 seconds of a user action with this plugin. */
  openUrl(url: string): void;

  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
};
