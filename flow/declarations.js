// 要了解 flow 的知识，可以看我这一篇博客：https://fei_fei27.gitee.io/flow/gettingStarted/introduce.html
// 声明一个全局变量，这个变量在该项目中的所有文件中都能够使用
declare var document: Document;

// 声明一个 RouteRegExp 类，该类继承自 RegExp (RegExp 是 path-to-regexp 库中的)，比父类多一个 keys 属性
declare class RouteRegExp extends RegExp {
  keys: Array<{ name: string, optional: boolean }>;
}

// 声明一个全局类型 PathToRegexpOptions
declare type PathToRegexpOptions = {
  // key?：可选对象属性。(1)可以传递指定的类型；(2)可以传递 undefined 值；(3)不传这个属性
  sensitive?: boolean,
  strict?: boolean,
  end?: boolean
}

// 为第三方模块定义 flow 类型
// vue router 主要在两处使用 path-to-regexp 库
// (1) Regexp(path, [], pathToRegexpOptions)
// (2) Regexp.compile(path)
// 第一个是将 Regexp 当成构造函数使用
// 第二个是使用 Regexp 对象中的 compile 方法
declare module 'path-to-regexp' {
  declare module.exports: {
    // 和 (1) 处代码对应，声明其构造函数的 flow 类型
    (path: string, keys?: Array<?{ name: string }>, options?: PathToRegexpOptions): RouteRegExp;
    // 和 (2) 处对应，声明 Regexp 对象中的 compile 方法的 flow 类型
    compile: (path: string) => (params: Object) => string;
  }
}

// 声明一个全局类型 Dictionary，并且包含一个泛型 T
declare type Dictionary<T> = { [key: string]: T }

// 声明一个全局类型 NavigationGuard
declare type NavigationGuard = (
  // Router 是在这个类型定义文件中定义的另一个全局类型
  to: Route,
  from: Route,
  // next 是一个函数类型，没有返回值。 | 是 flow 中的 union 类型，与"或"同义
  next: (to?: RawLocation | false | Function | void) => void
) => any

// 类型是一个函数
// any 类型是指所有类型的值都可以
declare type AfterNavigationHook = (to: Route, from: Route) => any

// 声明一个本地类型，这个类型只能在这个类型定义文件中使用，在其他的代码文件中不能使用
type Position = { x: number, y: number };
// 声明一个本地类型
type PositionResult = Position | { selector: string, offset?: Position } | void;

// VueRouter() 的配置对象的类型
declare type RouterOptions = {
  routes?: Array<RouteConfig>;
  mode?: string;
  fallback?: boolean;
  base?: string;
  linkActiveClass?: string;
  linkExactActiveClass?: string;
  parseQuery?: (query: string) => Object;
  stringifyQuery?: (query: Object) => string;
  scrollBehavior?: (
    to: Route,
    from: Route,
    // ?Position 是一个 maybe 类型。(1)指定类型的值；(2)null；(3)undefined
    savedPosition: ?Position
  ) => PositionResult | Promise<PositionResult>;
}

// 声明一个全局类型
declare type RedirectOption = RawLocation | ((to: Route) => RawLocation)

// 路由原始配置的类型
declare type RouteConfig = {
  path: string;
  name?: string;
  component?: any;
  // 由于 type Dictionary<T> = { [key: string]: T }
  // 所以 Dictionary<any> == { [key: string]: any }
  components?: Dictionary<any>;
  redirect?: RedirectOption;
  alias?: string | Array<string>;
  children?: Array<RouteConfig>;
  beforeEnter?: NavigationGuard;
  meta?: any;
  props?: boolean | Object | Function;
  caseSensitive?: boolean;
  pathToRegexpOptions?: PathToRegexpOptions;
}

// 下面的类型定义语法和上面一样，就不过多赘述了。
declare type RouteRecord = {
  path: string;
  regex: RouteRegExp;
  components: Dictionary<any>;
  instances: Dictionary<any>;
  enteredCbs: Dictionary<Array<Function>>;
  name: ?string;
  parent: ?RouteRecord;
  redirect: ?RedirectOption;
  matchAs: ?string;
  beforeEnter: ?NavigationGuard;
  meta: any;
  props: boolean | Object | Function | Dictionary<boolean | Object | Function>;
}

declare type Location = {
  _normalized?: boolean;
  name?: string;
  path?: string;
  hash?: string;
  query?: Dictionary<string>;
  params?: Dictionary<string>;
  append?: boolean;
  replace?: boolean;
}

declare type RawLocation = string | Location

declare type Route = {
  path: string;
  name: ?string;
  hash: string;
  query: Dictionary<string>;
  params: Dictionary<string>;
  fullPath: string;
  matched: Array<RouteRecord>;
  redirectedFrom?: string;
  meta?: any;
}
