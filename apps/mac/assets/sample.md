# webview-demo sample

A rich Markdown sample covering common patterns.

## Table of contents
- [webview-demo sample](#webview-demo-sample)
  - [Table of contents](#table-of-contents)
  - [Headings](#headings)
- [H1](#h1)
  - [H2](#h2)
    - [H3](#h3)
      - [H4](#h4)
        - [H5](#h5)
          - [H6](#h6)
  - [Text styles](#text-styles)
  - [Lists](#lists)
  - [Links and images](#links-and-images)
  - [Blockquotes](#blockquotes)
  - [Code](#code)
  - [Mermaid](#mermaid)
  - [Tables](#tables)
  - [HTML](#html)
  - [Footnotes](#footnotes)
  - [Task list](#task-list)
  - [Definition list](#definition-list)
  - [Thematic break](#thematic-break)

## Headings
# H1
## H2
### H3
#### H4
##### H5
###### H6

## Text styles
**Bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`, <span underline="true">underline (html)</span>.

Escaped characters: \* \_ \~ \` \[ \] \( \) \# \+ \- \\.

## Lists
- Unordered item A
- Unordered item B
  - Nested item B.1
  - Nested item B.2

1. Ordered item 1
2. Ordered item 2
   1. Nested ordered 2.1
   2. Nested ordered 2.2

Mixed list:
- Item with paragraph

  This is a second paragraph inside a list item.

## Links and images
- [OpenAI](https://openai.com)
- Autolink: <https://example.com>

![sample.png](img/sample.png)

## Blockquotes
> Blockquote line 1
> Blockquote line 2
> 
> - Quote list item
> - Another item

## Code
Inline: `const answer = 42;`

Fenced code block (ts):
```ts
export type User = {
  id: string;
  name: string;
  tags?: string[];
};

export function greet(user: User) {
  return `Hello, ${user.name}!`;
}
```

Indented code block:

    mkdir -p apps/webview-demo
    pnpm -C apps/webview-demo run dev

## Mermaid
```mermaid
graph TD
  Start([Start]) --> Draft[Write Draft]
  Draft --> Review{Reviewed?}
  Review -->|Yes| Publish([Publish])
  Review -->|No| Draft
```

## Tables
| Col A | Col B | Col C  |
| :---- | ----: | :----: |
| left  | right | center |
| 1     |     2 |   3    |

## HTML
<div>
  <strong>HTML block</strong>
  <em>Inline HTML</em>
</div>

## Footnotes
Here is a footnote reference.[^1]

[^1]: Footnote text goes here.

## Task list
- [x] Done item
- [ ] Todo item

## Definition list
Term 1
: Definition A

Term 2
: Definition B

## Thematic break
---

End of sample.
