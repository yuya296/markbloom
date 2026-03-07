const blockedSvgElements = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
]);

const allowedHrefProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeSvgHref(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.startsWith("#")) {
    return true;
  }
  const protocolMatch = normalized.match(/^([a-z][a-z0-9+.-]*:)/);
  if (!protocolMatch) {
    return true;
  }
  return allowedHrefProtocols.has(protocolMatch[1]);
}

export function sanitizeSvgElementTree(root: Element) {
  const allElements = [root, ...root.querySelectorAll("*")];
  for (const element of allElements) {
    const tagName = (element.localName || element.tagName).toLowerCase();
    if (blockedSvgElements.has(tagName)) {
      element.remove();
      continue;
    }
    sanitizeSvgAttributes(element);
  }
}

export function sanitizeSvgAttributes(element: Element) {
  for (const attribute of [...element.attributes]) {
    const attributeName = attribute.name.toLowerCase();
    const attributeValue = attribute.value.trim().toLowerCase();

    if (attributeName.startsWith("on")) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (attributeName === "href" || attributeName === "xlink:href") {
      if (!isSafeSvgHref(attributeValue)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

export function parseAndSanitizeSvg(svgMarkup: string, doc: Document): SVGElement | null {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    return null;
  }

  const root = parsed.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    return null;
  }

  sanitizeSvgElementTree(root);
  const imported = doc.importNode(root, true) as unknown as Element;
  sanitizeSvgElementTree(imported);
  return imported as unknown as SVGElement;
}
