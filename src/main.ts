import { DemoApp } from './demo/DemoApp';

const container = document.getElementById('app')!;
const app = new DemoApp(container);
app.start();

// Expose for debugging in the console
(window as any).app = app;
