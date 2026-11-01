importScripts('./core.js','./domino-model.js','./wireworld-model.js','./wireworld-compile.js');
const wireworldController=LogicWireworld.createController(data=>postMessage(data),LogicWireworldCompile);
onmessage=event=>wireworldController.handle(event.data);
