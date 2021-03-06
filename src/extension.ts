// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {SnakevizEditorProvider} from './snakevizEditor';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(SnakevizEditorProvider.register(context));
}

// this method is called when your extension is deactivated
export function deactivate() {}
