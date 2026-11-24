#ifndef SHIORI_MSVC_COMPAT_H
#define SHIORI_MSVC_COMPAT_H

// MSVC lacks this builtin used by espeak's vendored compatibility headers.
#if defined(_MSC_VER) && !defined(__has_include_next)
#define __has_include_next(header) 0
#endif

#endif
