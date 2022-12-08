# Unscuffed Vtubers

Installation:
```
$ npm install
```

To run:
```
$ npm run dev
```

If encountering the following error
```
this[kHandle] = new _Hash(algorithm, xofLen);
```
set the environment variable:
```
$ export NODE_OPTIONS=--openssl-legacy-provider
```