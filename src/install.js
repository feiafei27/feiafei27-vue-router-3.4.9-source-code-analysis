import View from './components/view'
import Link from './components/link'

// 用于保存安装 Vue Router 插件的 Vue 实例
export let _Vue

export function install (Vue) {
  // 如果 install.installed == true 且 _Vue === Vue，则直接 return，防止多次安装
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  // 用于判断 v 是否定义了的函数。如果 v 是 undefined 的话，返回 false，否则返回 true。
  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    // 获取 vm 组件的父节点
    let i = vm.$options._parentVnode
    // isDef(i = i.data)：这种写法比较少见，其先执行 i = i.data，对变量 i 进行赋值，然后再将赋值过后的变量 i 当做参数执行 isDef 函数
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      // 如果函数执行到了这里，此时变量 i == vm.$options._parentVnode.data.registerRouteInstance
      // 只有当 vm 有父节点，且该父节点有 data 属性，并且 data 属性中有 registerRouteInstance 方法的时候，才会执行到这里
      // 通过全局搜索，我们可以知道，这个 registerRouteInstance 方法定义在 <router-view> 组件中。
      // 也就是说只有 <router-view> 的子组件的 beforeCreate、destroyed 方法，才会进到这个if里，调用 registerRouteInstance 方法
      // registerRouteInstance 方法的作用是往父级 <router-view> 组件中注册 callVal 子组件。
      i(vm, callVal)
    }
  }

  // 利用 mixin 为所有的 Vue 实例添加功能代码，这些功能代码用于为 Vue 实例添加 Vue Router 相关的功能
  Vue.mixin({
    beforeCreate () {
      // this.$options 是我们生成 Vue 实例时传递的配置对象。例如：
      // const app = new Vue({
      //   // 使用 new VueRouter({}) 生成的路由实例
      //   router
      // }).$mount('#app')
      // 这其中的 { router } 就是 this.$options

      // 判断当前 Vue 实例的配置对象有没有 router 属性，这一个 if 块处理 Vue 实例是顶级 Vue 实例的情况，
      // 例如上一个注释中的 app，因为只有这种情况下，配置对象中才会有 router 属性。
      if (isDef(this.$options.router)) {
        // 给当前的 Vue 实例添加 _routerRoot 属性，这个属性指向它自己
        this._routerRoot = this
        // 给当前的 Vue 实例添加 _router 属性，这个属性指向配置对象中的 router 对象，这个 router 对象是通过 new VueRouter({}) 生成的。
        this._router = this.$options.router
        // 调用路由对象的 init 方法，这个方法的作用之后再说。
        this._router.init(this)
        // 这个 defineReactive 方法有两个作用，(1)给对象的属性赋值；(2)将对象的这个属性变成响应式的；
        // this._router.history.current 指向当前的路由。
        // 当_route发生变化时，会重新进入<router-view>和<router-link>的render渲染函数。
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 如果当前组件有父组件，并且该父组件有 _routerRoot 属性的话，将这个 _routerRoot 属性赋值给当前组件的 _routerRoot
        // 就这样，从最顶级的组件一层一层向下传递赋值 _routerRoot，最终的效果是项目中的所有 Vue 实例都会有 _routerRoot 属性
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 每个 Vue 实例在 beforeCreate 阶段都会执行 registerInstance(this, this)，让我们调到这一个方法，看看有什么作用。
      registerInstance(this, this)
    },
    destroyed () {
      // registerInstance(this, this) 是注册这个组件
      // registerInstance(this) 取消注册这个组件
      registerInstance(this)
    }
  })

  // 给 Vue.prototype 定义属性 $router，这个属性实际指向当前 Vue 实例的 _routerRoot._router，
  // 通过上面的内容，我们知道，每个 Vue 组件都有 _routerRoot 属性，这个属性指向根 Vue 实例，
  // 所以 _routerRoot._router 实际上是指向我们根 Vue 组件的 _router 属性，而这个 _router 属性指向我们 new 根 Vue 实例时传递的 router。
  // 又由于 $router 属性是在 Vue.prototype 对象中，所以我们项目中所有的 Vue 实例都能够访问到这个 $router 属性，
  // 每个 Vue 实例都能够通过 this.$router 访问到我们传递给根组件的 router 对象，这个对象通过 new VueRouter({}) 创建。
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // 和 $router 同理，通过定义 $route，所有的 Vue 实例都可以通过 this.$route 访问到 router(路由器) 对象中的当前路由(.history.current)
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 定义 Vue Router 中用到的全局组件，RouterView 和 RouterLink
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 这一部分代码对应官网中的：https://cn.vuejs.org/v2/guide/mixins.html#自定义选项合并策略
  const strats = Vue.config.optionMergeStrategies
  // beforeRouteEnter、beforeRouteLeave 和 beforeRouteUpdate 方法都是使用默认的合并策略
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
  // install 方法到这就看完了，接下来看 index.js --> VueRouter 类的具体内容
}
