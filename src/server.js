const app = require('./app');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API sur http://localhost:${port}  |  Swagger : http://localhost:${port}/api-docs`));
