package com.bustracker

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

// ==============================================================================
// ⚠️ WARNING: SSL BYPASS FACTORY FOR LOCAL TESTING ONLY
// DO NOT SHIP THIS TO PRODUCTION (GOOGLE PLAY WILL REJECT IT)
// ==============================================================================
class UnsafeOkHttpClientFactory : OkHttpClientFactory {
    override fun createNewNetworkModuleClient(): OkHttpClient {
        return try {
            val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            })

            val sslContext = SSLContext.getInstance("SSL")
            sslContext.init(null, trustAllCerts, SecureRandom())

            val builder = OkHttpClientProvider.createClientBuilder()
            builder.sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            builder.hostnameVerifier { _, _ -> true }

            builder.build()
        } catch (e: Exception) {
            throw RuntimeException(e)
        }
    }
}
// ==============================================================================

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    
    // ⚠️ WARNING: UNCOMMENT THIS ONLY FOR TESTING WITH UNTRUSTED SSL CERTIFICATES
    // ⚠️ BE SURE TO REMOVE OR COMMENT THIS OUT BEFORE BUILDING FOR PRODUCTION
    OkHttpClientProvider.setOkHttpClientFactory(UnsafeOkHttpClientFactory())

    loadReactNative(this)
  }
}
