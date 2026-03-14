export function hashSync(password: string, rounds?: number): string;
export function hash(password: string, rounds?: number): Promise<string>;
export function compareSync(password: string, storedHash: string): boolean;
export function compare(password: string, storedHash: string): Promise<boolean>;
