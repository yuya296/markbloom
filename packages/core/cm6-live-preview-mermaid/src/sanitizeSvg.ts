const blockedSvgElements = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
]);

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

    if (
      (attributeName === "href" || attributeName === "xlink:href") &&
      (attributeValue.startsWith("javascript:") ||
        attributeValue.startsWith("data:text/html"))
    ) {
      element.removeAttribute(attribute.name);
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
