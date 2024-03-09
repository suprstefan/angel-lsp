import {Position, URI} from 'vscode-languageserver';

enum TokenKind {
    Number,
    Comment,
    Variable,
    Operator,
}

export const tokenTypes = [
    'number',
    'comment',
    'variable',
    'operator',
];

interface Location {
    uri: URI,
    start: Position,
    end: Position,
}

interface Token {
    kind: TokenKind;
    text: string;
    location: Location;
}

class ReadingState {
    str: string;
    cursor: number;
    head: Position;

    constructor(str: string) {
        this.str = str;
        this.cursor = 0;
        this.head = {line: 0, character: 0};
    }

    next(offset: number = 0) {
        return this.str[this.cursor + offset];
    }

    isEnd() {
        return this.cursor >= this.str.length;
    }

    isNext(expected: string) {
        return this.str.substring(this.cursor, this.cursor + expected.length) === expected;
    }

    isNextWrap() {
        const next = this.next();
        return next === '\r' || next === '\n';
    }

    isNextWhitespace() {
        const next = this.str[this.cursor];
        return next === ' ' || next === '\t';
    }

    stepNext() {
        if (this.isEnd()) return;

        if (this.isNextWrap()) {
            this.head.line++;
            this.head.character = 0;
            if (this.isNext('\r\n')) this.cursor += 2;
            else this.cursor += 1;
        } else {
            this.head.character++;
            this.cursor += 1;
        }
    }

    stepFor(count: number) {
        for (let i = 0; i < count; ++i) this.stepNext();
    }

    copyHead() {
        return {
            line: this.head.line,
            character: this.head.character
        };
    }
}

function isDigit(str: string): boolean {
    return /^[0-9]$/.test(str);
}

function isAlnum(c: string): boolean {
    return /^[A-Za-z0-9_]$/.test(c);
}

const allSymbols = [
    '*', '**', '/', '%', '+', '-', '<=', '<', '>=', '>', '(', ')', '==', '!=', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--', '&', ',', '{', '}', ';', '|', '^', '~', '<<', '>>', '>>>', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '.', '&&', '||', '!', '[', ']', '^^', '@', '::',
    // FIXME: !is をどうするか
];

let s_symbolsSorted = false;

function tryComment(reading: ReadingState) {
    if (reading.isNext('//')) {
        reading.stepFor(2);
        let comment = '//';
        for (; ;) {
            if (reading.isEnd() || reading.isNextWrap()) break;
            comment += reading.next();
            reading.stepNext();
        }
        return comment;
    }
    if (reading.isNext('/*')) {
        reading.stepFor(2);
        let comment = '/*';
        for (; ;) {
            if (reading.isEnd() || reading.isNext('*/')) break;
            if (reading.isNext('\r\n')) comment += '\r\n';
            else comment += reading.next();
            reading.stepNext();
        }
        return comment;
    }
    return '';
}

function trySymbol(reading: ReadingState) {
    if (s_symbolsSorted === false) {
        allSymbols.sort((a, b) => b.length - a.length);
        s_symbolsSorted = true;
    }

    for (const symbol of allSymbols) {
        if (reading.isNext(symbol)) {
            reading.stepFor(symbol.length);
            return symbol;
        }
    }
    return '';
}

function tryNumber(reading: ReadingState) {
    let result: string = "";
    while (reading.isEnd() === false && isDigit(reading.next())) {
        result += reading.next();
        reading.stepNext();
    }
    return result;
}

function tryIdentifier(reading: ReadingState) {
    let result: string = "";
    while (reading.isEnd() === false && isAlnum(reading.next())) {
        result += reading.next();
        reading.stepNext();
    }
    return result;
}

export function tokenize(str: string, uri: URI) {
    const tokens: Token[] = [];
    const reading = new ReadingState(str);

    for (; ;) {
        reading.stepNext();
        if (reading.isEnd()) break;
        if (reading.isNextWrap()) continue;
        if (reading.isNextWhitespace()) continue;

        const location = {
            start: reading.copyHead(),
            end: reading.copyHead(),
            uri: uri
        };

        // コメント
        const triedComment = tryComment(reading);
        if (triedComment.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Comment,
                text: triedComment,
                location: location
            });
        }

        // 数値
        const triedNumber = tryNumber(reading);
        if (triedNumber.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Number,
                text: triedNumber,
                location: location
            });
        }

        // 識別子
        const triedIdentifier = tryIdentifier(reading);
        if (triedIdentifier.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Variable,
                text: triedIdentifier,
                location: location
            });
        }

        // シンボル
        const triedSymbol = trySymbol(reading);
        if (triedSymbol.length > 0) {
            location.end = reading.copyHead();
            tokens.push({
                kind: TokenKind.Operator,
                text: triedSymbol,
                location: location
            });
        }

    }

    return tokens;
}
