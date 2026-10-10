export type Line = {
    at: number;
    html: string;
    kind?: 'small' | 'explain' | 'result';
};
export type Story = {
    kicker: string;
    title: string;
    lines: Line[];
};
export declare const story: Story[];
export declare const narration: [number, string][];
