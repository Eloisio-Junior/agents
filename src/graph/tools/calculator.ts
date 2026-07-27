// Safe arithmetic evaluator (NO eval / new Function). A small recursive-descent parser over a
// hand-rolled tokenizer, supporting + - * / % ^, unary +/-, parentheses and decimal numbers.
// Used by the `calculator` native tool so the agent can do exact math without a model round-trip.

export class CalculatorError extends Error {}

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      let dots = 0;
      while (j < s.length) {
        const d = s[j] as string;
        if (d >= "0" && d <= "9") {
          j++;
        } else if (d === ".") {
          dots++;
          if (dots > 1) throw new CalculatorError("malformed number");
          j++;
        } else {
          break;
        }
      }
      tokens.push({ type: "num", value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === ".") {
      // A bare leading dot like ".5"
      let j = i + 1;
      while (j < s.length) {
        const d = s[j] as string;
        if (d >= "0" && d <= "9") j++;
        else break;
      }
      if (j === i + 1) throw new CalculatorError("malformed number");
      tokens.push({ type: "num", value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (
      c === "+" ||
      c === "-" ||
      c === "*" ||
      c === "/" ||
      c === "%" ||
      c === "^"
    ) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    throw new CalculatorError(`unexpected character: ${c}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  // expression := term (('+' | '-') term)*
  parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
        this.next();
        const rhs = this.parseTerm();
        value = tok.value === "+" ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  // term := unary (('*' | '/' | '%') unary)*
  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      const tok = this.peek();
      if (
        tok?.type === "op" &&
        (tok.value === "*" || tok.value === "/" || tok.value === "%")
      ) {
        this.next();
        const rhs = this.parseUnary();
        if ((tok.value === "/" || tok.value === "%") && rhs === 0) {
          throw new CalculatorError("division by zero");
        }
        if (tok.value === "*") value *= rhs;
        else if (tok.value === "/") value /= rhs;
        else value %= rhs;
      } else {
        break;
      }
    }
    return value;
  }

  // unary := ('+' | '-') unary | power
  private parseUnary(): number {
    const tok = this.peek();
    if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
      this.next();
      const operand = this.parseUnary();
      return tok.value === "-" ? -operand : operand;
    }
    return this.parsePower();
  }

  // power := primary ('^' unary)?  — right-associative, binds tighter than unary on the RHS
  private parsePower(): number {
    const base = this.parsePrimary();
    const tok = this.peek();
    if (tok?.type === "op" && tok.value === "^") {
      this.next();
      const exponent = this.parseUnary();
      return base ** exponent;
    }
    return base;
  }

  private parsePrimary(): number {
    const tok = this.next();
    if (!tok) throw new CalculatorError("unexpected end of expression");
    if (tok.type === "num") return tok.value;
    if (tok.type === "lparen") {
      const value = this.parseExpression();
      const close = this.next();
      if (close?.type !== "rparen") {
        throw new CalculatorError("missing closing parenthesis");
      }
      return value;
    }
    throw new CalculatorError("expected a number or '('");
  }

  expectEnd(): void {
    if (this.pos !== this.tokens.length) {
      throw new CalculatorError("unexpected trailing input");
    }
  }
}

export function evaluateExpression(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) throw new CalculatorError("empty expression");
  const parser = new Parser(tokenize(trimmed));
  const value = parser.parseExpression();
  parser.expectEnd();
  if (!Number.isFinite(value)) {
    throw new CalculatorError("result is not a finite number");
  }
  return value;
}
