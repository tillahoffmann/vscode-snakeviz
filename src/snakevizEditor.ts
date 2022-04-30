import * as vscode from 'vscode';
import * as child_process from 'child_process';



class SnakevizDocument implements vscode.CustomDocument {
    private readonly _uri : vscode.Uri;
    private readonly _child : child_process.ChildProcess;
    public readonly snakevizUrl: Promise<string>;

    private constructor(uri: vscode.Uri, child: child_process.ChildProcess) {
        this._uri = uri;
        this._child = child;
        let resolveSnakeVizUrl: (value: string | PromiseLike<string>) => void;
        // Create a promise to await and which we will resolve by listening to the snakeviz stdout.
        this.snakevizUrl = new Promise<string>((resolve, reject) => {
            resolveSnakeVizUrl = resolve;
		});
        child.stdout?.on("data", (chunk) => {
            chunk = chunk.toString();
            let line: string;
            for (line of chunk.splitLines()) {
                if (line.startsWith("http://")) {
                    resolveSnakeVizUrl(line);
                }
            }
        });
    }

    public static async create(uri: vscode.Uri): Promise<SnakevizDocument> {
        const child = child_process.spawn(
            await SnakevizDocument.getPythonInterpreter(),
            ["-m", "snakeviz", "--server", uri.path], {
                env: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "PYTHONUNBUFFERED": "1",
                }
            }
        );
        //const child = child_process.spawn("echo", ["hello"]);
        return new SnakevizDocument(uri, child);
    }

    static async getPythonInterpreter() {
        const extension = vscode.extensions.getExtension("ms-python.python");
        if (!extension) {
            return "python";
        }
        if (!extension.isActive) {
            await extension.activate();
        }
        return extension.exports.settings.getExecutionDetails().execCommand[0];
    }

    public get uri(): vscode.Uri { return this._uri; }
    public dispose(): void {
        this._child.kill();
    }
}

export class SnakevizEditorProvider implements vscode.CustomReadonlyEditorProvider<SnakevizDocument> {
    private static readonly viewType = 'snakeviz.snakeviz';
    private readonly context: vscode.ExtensionContext;

    public static register(context: vscode.ExtensionContext) {
        return vscode.window.registerCustomEditorProvider(
            SnakevizEditorProvider.viewType,
            new SnakevizEditorProvider(context)
        );
    }

    constructor (context: vscode.ExtensionContext) {
        this.context = context;
    }

    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<SnakevizDocument> {
        return await SnakevizDocument.create(uri);
    }

    async resolveCustomEditor(document: SnakevizDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        const snakevizUrl = await document.snakevizUrl;
        const webview = webviewPanel.webview;
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'assets', 'snakeviz.css'));
        webview.options = {
            enableScripts: true,
        };
        webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <link href="${styleMainUri}" rel="stylesheet" />
        </head>
        <body>
            <iframe src="${snakevizUrl}"></iframe>
        </body>
        </html>
        `;
    }
}
