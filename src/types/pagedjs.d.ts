// The slice of Paged.js 0.4 the page view uses. The package ships no types.
declare module "pagedjs" {
  interface Flow {
    total: number;
  }

  /** A stylesheet passed as `{ name: cssText }` is used as given, never fetched. */
  type StylesheetSource = Record<string, string>;

  export class Previewer {
    polisher: { destroy(): void };
    chunker: { destroy(): void };
    preview(content: Element | DocumentFragment, stylesheets: StylesheetSource[], renderTo: Element): Promise<Flow>;
  }

  /** Base for layout hooks: a method named after a hook (onOverflow, renderNode…) is called by it. */
  export class Handler {
    constructor(chunker: unknown, polisher: unknown, caller: unknown);
  }

  /** Adds handlers to every Previewer made afterwards. */
  export function registerHandlers(...handlers: (typeof Handler)[]): void;
}
