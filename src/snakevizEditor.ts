import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { EnvironmentVariables, PythonExtension, Resource } from '@vscode/python-extension';



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
        child.stdout!.on("data", (chunk) => {
            chunk = chunk.toString();
            let line: string;
            for (line of chunk.splitLines()) {
                if (line.startsWith("http://")) {
                    resolveSnakeVizUrl(line);
                }
            }
        });
        child.stderr!.on("data", (chunk) => {
            vscode.window.showErrorMessage(chunk.toString());
        });
    }

    public static async create(uri: vscode.Uri): Promise<SnakevizDocument> {
        const child = child_process.spawn(
            await SnakevizDocument.getPythonInterpreter(uri),
            ["-m", "snakeviz", "--server", uri.fsPath], {
                env: {
                    ... await SnakevizDocument.getPythonEnviornmentVariables(uri),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "PYTHONUNBUFFERED": "1",
                }
            }
        );
        //const child = child_process.spawn("echo", ["hello"]);
        return new SnakevizDocument(uri, child);
    }

    static async getPythonInterpreter(resource?: Resource) {
        let executable: string | undefined;

        const pythonApi: PythonExtension = await PythonExtension.api();
        const environmentPath = pythonApi.environments.getActiveEnvironmentPath(resource);
        const environment = await pythonApi.environments.resolveEnvironment(environmentPath);
        if (environment) {
            executable ??= environment.executable.uri?.fsPath;
        }

        // Fallback to using system-wide "python" as the interpreter.
        executable ??= "python";

        return executable;
    }

    static async getPythonEnviornmentVariables(resource?: Resource) {
        let env: NodeJS.ProcessEnv | EnvironmentVariables | undefined;

        const pythonApi: PythonExtension = await PythonExtension.api();
        const environmentPath = pythonApi.environments.getActiveEnvironmentPath(resource);
        const environment = await pythonApi.environments.resolveEnvironment(environmentPath);
        if (environment) {
            env ??= pythonApi.environments.getEnvironmentVariables(resource);
        }
        
        // Fallback to returning the current enviornment
        env ??= process.env;

        return env;
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
