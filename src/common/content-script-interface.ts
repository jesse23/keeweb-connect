export interface ContentScriptMessageAutoFill {
    action: 'auto-fill';
    url: string;
    text?: string;
    password?: string;
    submit: boolean;
}

export interface ContentScriptMessageGetNextAutoFillCommand {
    action: 'get-next-auto-fill-command';
    url: string;
}

export type ContentScriptMessage =
    ContentScriptMessageAutoFill | ContentScriptMessageGetNextAutoFillCommand;

export interface ContentScriptReturn {
    nextCommand?: string;
    /** set by auto-fill: true when a field was filled */
    filled?: boolean;
    /** set by auto-fill when nothing could be filled; a short human-readable reason */
    error?: string;
}
